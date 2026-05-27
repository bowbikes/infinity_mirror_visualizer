/**
 * Apply manufacturability filters to a black SVG: nozzle rounding + size
 * floors. This is the shared post-step for raster-derived AND color-derived
 * inputs, so anything users see in the 3D preview reflects what'll actually
 * get cut/printed.
 *
 * Order (mirrors the Python pipeline):
 *   1. Nozzle rounding via opening-then-closing — smooths sharp corners
 *      below the printer's reproducible radius.
 *   2. Width floor — erosion-as-predicate, drop polygons whose
 *      island.buffer(-w/2) is empty (matches the May-26 IM_SVG_Maker decision
 *      to use erode-only as a keep-or-drop test rather than morphological
 *      opening, which fractured islands at thin necks).
 *   3. Area floor — drop polygons below `minIslandAreaMm2` after nozzle
 *      rounding may have whittled them down.
 *
 * Ports:
 *   - im_svg_maker/geometry.py nozzle rounding (`cut.buffer(-r).buffer(+r).buffer(+r).buffer(-r)`)
 *   - im_svg_maker/raster.py::_apply_thresholds (size floors)
 */
import ClipperLib from 'clipper-lib'

import { parseSvgToPolygons, polygonsToSvg, polygonArea } from './svgParse.js'

// Match the scale in svgParse.js so offset deltas line up with the polygon
// integer space.
const CLIPPER_SCALE = 1000

// Clipper offset tunables. arcTolerance=0.25 in *integer* units means our
// round joins are accurate to 0.25/1000 = 0.00025 SVG units, well below the
// 0.5mm parity-bbox tolerance.
const CLIPPER_MITER_LIMIT = 2.0
const CLIPPER_ARC_TOLERANCE = 0.25

function ringToClipperPath(ring) {
  return ring.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }))
}

function clipperPathToRing(path) {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

// PolyTree members are sometimes functions, sometimes properties — same
// adapter pattern as svgParse.
function readMember(node, name) {
  if (node == null) return undefined
  const m = node[name]
  return typeof m === 'function' ? m.call(node) : m
}
function getChilds(node) {
  const c = readMember(node, 'Childs')
  return Array.isArray(c) ? c : []
}
function isHole(node) {
  return Boolean(readMember(node, 'IsHole'))
}
function getContour(node) {
  return readMember(node, 'Contour') || []
}

function collectFromPolyTree(node, out) {
  if (!node) return
  const contour = getContour(node)
  if (!isHole(node) && contour.length >= 3) {
    const outer = clipperPathToRing(contour)
    const holes = []
    for (const child of getChilds(node)) {
      const childContour = getContour(child)
      if (isHole(child) && childContour.length >= 3) {
        holes.push(clipperPathToRing(childContour))
      }
      for (const grandchild of getChilds(child)) {
        collectFromPolyTree(grandchild, out)
      }
    }
    out.push({ outer, holes })
  } else {
    for (const child of getChilds(node)) {
      collectFromPolyTree(child, out)
    }
  }
}

/**
 * Offset a polygon set by `delta` SVG units (positive expands, negative
 * erodes). Round joins everywhere (mirrors Python's
 * `shapely.buffer(d, join_style='round')`). Returns a possibly-empty new
 * polygon list — offsets can both split an input polygon into pieces (if
 * erosion separates two islands previously connected by a thin neck) and
 * collapse it to nothing (if erosion exceeds the half-width everywhere).
 */
function offsetPolygons(polygons, delta) {
  if (polygons.length === 0) return []
  const co = new ClipperLib.ClipperOffset(
    CLIPPER_MITER_LIMIT,
    CLIPPER_ARC_TOLERANCE
  )
  for (const poly of polygons) {
    co.AddPath(
      ringToClipperPath(poly.outer),
      ClipperLib.JoinType.jtRound,
      ClipperLib.EndType.etClosedPolygon
    )
    for (const hole of poly.holes) {
      co.AddPath(
        ringToClipperPath(hole),
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etClosedPolygon
      )
    }
  }
  const polyTree = new ClipperLib.PolyTree()
  co.Execute(polyTree, delta * CLIPPER_SCALE)
  const out = []
  for (const child of getChilds(polyTree)) {
    collectFromPolyTree(child, out)
  }
  return out
}

/**
 * Open-then-close: erode by r, dilate by 2r, erode by r. Net effect of a
 * round-join opening followed by a round-join closing — smooths both convex
 * and concave corners under the radius threshold. Direct port of the Python
 * `cut.buffer(-r).buffer(+r).buffer(+r).buffer(-r)` chain.
 */
function openThenClose(polygons, radius) {
  if (radius <= 0) return polygons
  const opened1 = offsetPolygons(polygons, -radius)
  const opened2 = offsetPolygons(opened1, +radius)
  const closed1 = offsetPolygons(opened2, +radius)
  const closed2 = offsetPolygons(closed1, -radius)
  return closed2
}

/**
 * Erosion test: does the polygon survive a single `buffer(-r)`? Used for
 * the width floor — if a polygon collapses entirely under erosion by
 * width/2, its narrowest cross-section is below the threshold and the
 * whole polygon gets dropped (drops-or-keeps semantics; no reshaping).
 */
function survivesErosion(polygon, radius) {
  if (radius <= 0) return true
  const eroded = offsetPolygons([polygon], -radius)
  return eroded.length > 0
}

/**
 * @param {string} svgString
 * @param {Object} [opts]
 * @param {number} [opts.minIslandAreaMm2=0]
 * @param {number} [opts.minFeatureWidthMm=0]
 * @param {number} [opts.nozzleDiameterMm=0.6]
 * @param {number} [opts.maxLogoDimMm=100]
 * @returns {{ svg: string, droppedThin: number, droppedSmall: number, warnings: string[] }}
 */
export function applyManufacturability(svgString, opts = {}) {
  const {
    minIslandAreaMm2 = 0,
    minFeatureWidthMm = 0,
    nozzleDiameterMm = 0.6,
    maxLogoDimMm = 100,
  } = opts

  const { polygons, viewBox } = parseSvgToPolygons(svgString)
  if (polygons.length === 0) {
    return {
      svg: polygonsToSvg([], viewBox),
      droppedThin: 0,
      droppedSmall: 0,
      warnings: [],
    }
  }

  // Convert mm thresholds into SVG-unit thresholds via the viewBox's
  // longest side, matching Python's `pixels_per_mm = max(w,h) / max_logo_dim_mm`.
  const longestSide = Math.max(viewBox.w, viewBox.h)
  const unitsPerMm = longestSide > 0 ? longestSide / maxLogoDimMm : 1

  // 1. Nozzle round (open-then-close at r = nozzle/2).
  let working = polygons
  if (nozzleDiameterMm > 0) {
    const rUnits = (nozzleDiameterMm / 2) * unitsPerMm
    working = openThenClose(working, rUnits)
  }

  // 2. Width floor — erosion-as-predicate, drop the offenders entirely.
  let droppedThin = 0
  if (minFeatureWidthMm > 0) {
    const rUnits = (minFeatureWidthMm / 2) * unitsPerMm
    const kept = []
    for (const poly of working) {
      if (survivesErosion(poly, rUnits)) kept.push(poly)
      else droppedThin += 1
    }
    working = kept
  }

  // 3. Area floor — drop polygons below the area threshold (SVG-unit² space).
  let droppedSmall = 0
  if (minIslandAreaMm2 > 0) {
    const thresholdUnits2 = minIslandAreaMm2 * unitsPerMm * unitsPerMm
    const kept = []
    for (const poly of working) {
      if (polygonArea(poly) >= thresholdUnits2) kept.push(poly)
      else droppedSmall += 1
    }
    working = kept
  }

  const warnings = []
  if (droppedThin > 0) {
    warnings.push(
      `${droppedThin} island(s) dropped — narrower than ${minFeatureWidthMm}mm.`
    )
  }
  if (droppedSmall > 0) {
    warnings.push(
      `${droppedSmall} island(s) dropped — smaller than ${minIslandAreaMm2}mm² area.`
    )
  }

  return {
    svg: polygonsToSvg(working, viewBox),
    droppedThin,
    droppedSmall,
    warnings,
  }
}
