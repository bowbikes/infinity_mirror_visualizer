/**
 * SVG → polygons. Port of im_svg_maker/svg_parse.py.
 *
 * Python uses svgelements + shapely.symmetric_difference for XOR/evenodd hole
 * handling. We split the work:
 *   - Three.js `SVGLoader` parses the SVG and flattens curves (arcs, Béziers)
 *     into polylines, one per <path> subpath. This handles all the SVG path
 *     syntax we'd otherwise have to write ourselves.
 *   - `clipper-lib` does the actual XOR via Clipper's `pftEvenOdd` poly-fill
 *     type. Three.js's `path.toShapes(false)` uses winding-direction heuristics
 *     rather than pure evenodd, which diverges from Python on nested holes —
 *     we want byte-faithful parity with the Python pipeline, so we do the
 *     XOR ourselves and ignore three.js's `toShapes` here.
 *
 * Output shape (the natural input for clipper-lib offset operations in
 * chunk 5's manufacturability port):
 *
 *   {
 *     polygons: [
 *       { outer: [{x, y}, ...], holes: [[{x, y}, ...], ...] },
 *       ...
 *     ],
 *     viewBox: { x, y, w, h }
 *   }
 *
 * Coordinates are in source SVG units (not normalized to mm). The 3D scene
 * applies the mm-scaling + Y-flip + centering downstream when consuming the
 * preprocessed SVG.
 */
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader.js'
import ClipperLib from 'clipper-lib'

const DEFAULT_CURVE_DIVISIONS = 32

// Clipper works in integers for numeric stability. Scale up SVG units before
// feeding in, scale down after. 1000 = sub-millimeter precision for any
// reasonable mirror-tile SVG, well clear of Clipper's 32-bit safe range.
const CLIPPER_SCALE = 1000

function pointsToClipperPath(points) {
  return points.map((p) => ({
    X: Math.round(p.x * CLIPPER_SCALE),
    Y: Math.round(p.y * CLIPPER_SCALE),
  }))
}

function clipperPathToPoints(path) {
  return path.map((p) => ({ x: p.X / CLIPPER_SCALE, y: p.Y / CLIPPER_SCALE }))
}

// clipper-lib exposes some PolyNode/PolyTree members as functions and others
// as properties depending on version. Normalize both styles.
function readMember(node, name) {
  if (node == null) return undefined
  const m = node[name]
  if (typeof m === 'function') return m.call(node)
  return m
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

/**
 * Walk a PolyTree, emitting `{outer, holes}` polygons. Recurses through
 * `child.Childs` so islands nested inside holes (the inner-disc case in
 * nested_holes.svg) come out as their own top-level polygons — matches
 * Python's `MultiPolygon.geoms` semantics exactly.
 */
function collectPolygonsFromPolyTree(node, polygons) {
  if (!node) return
  const contour = getContour(node)
  if (!isHole(node) && contour.length >= 3) {
    const outer = clipperPathToPoints(contour)
    const holes = []
    for (const child of getChilds(node)) {
      const childContour = getContour(child)
      if (isHole(child) && childContour.length >= 3) {
        holes.push(clipperPathToPoints(childContour))
      }
      // Grandchildren of an outer node (whether through a hole or directly)
      // are nested-inside-hole islands; surface them as separate polygons.
      for (const grandchild of getChilds(child)) {
        collectPolygonsFromPolyTree(grandchild, polygons)
      }
    }
    polygons.push({ outer, holes })
  } else {
    for (const child of getChilds(node)) {
      collectPolygonsFromPolyTree(child, polygons)
    }
  }
}

/**
 * @param {string} svgString
 * @param {Object} [opts]
 * @param {number} [opts.curveDivisions=32]   Béziers/arcs sampled to this many segments per curve.
 * @returns {{ polygons: Polygon[], viewBox: {x:number,y:number,w:number,h:number} }}
 *
 * @typedef {Object} Point
 * @property {number} x
 * @property {number} y
 *
 * @typedef {Object} Polygon
 * @property {Point[]} outer
 * @property {Point[][]} holes
 */
export function parseSvgToPolygons(svgString, opts = {}) {
  const { curveDivisions = DEFAULT_CURVE_DIVISIONS } = opts

  const data = new SVGLoader().parse(svgString)

  // Step 1: flatten every <path> subpath into a closed polyline.
  const rings = []
  for (const shapePath of data.paths) {
    for (const subPath of shapePath.subPaths) {
      const pts = subPath.getPoints(curveDivisions)
      if (pts.length < 3) continue
      rings.push(pointsToClipperPath(pts.map((p) => ({ x: p.x, y: p.y }))))
    }
  }

  // Step 2: XOR them all together via Clipper's even-odd rule. This is the
  // direct JS equivalent of Python's `result.symmetric_difference(p)` loop.
  const polygons = []
  if (rings.length > 0) {
    const clipper = new ClipperLib.Clipper()
    clipper.AddPaths(rings, ClipperLib.PolyType.ptSubject, true)
    const polyTree = new ClipperLib.PolyTree()
    clipper.Execute(
      ClipperLib.ClipType.ctUnion,
      polyTree,
      ClipperLib.PolyFillType.pftEvenOdd,
      ClipperLib.PolyFillType.pftEvenOdd
    )
    // PolyTree's synthetic root holds the top-level outers in Childs.
    for (const child of getChilds(polyTree)) {
      collectPolygonsFromPolyTree(child, polygons)
    }
  }

  const viewBox = parseViewBox(svgString, polygons)
  return { polygons, viewBox }
}

function parseViewBox(svgString, polygons) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml')
  const root = doc.documentElement
  const vbAttr = root.getAttribute('viewBox')
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
    }
  }
  const w = parseFloat(root.getAttribute('width') || '0')
  const h = parseFloat(root.getAttribute('height') || '0')
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h }
  return bboxUnion(polygons)
}

function bboxUnion(polygons) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const poly of polygons) {
    for (const ring of [poly.outer, ...poly.holes]) {
      for (const { x, y } of ring) {
        if (x < minX) minX = x; if (x > maxX) maxX = x
        if (y < minY) minY = y; if (y > maxY) maxY = y
      }
    }
  }
  if (minX === Infinity) return { x: 0, y: 0, w: 0, h: 0 }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY }
}

/* ---------------- inverse: polygons → SVG ---------------- */

function ringToD(ring) {
  if (!ring || ring.length === 0) return ''
  const parts = [`M${ring[0].x.toFixed(6)},${ring[0].y.toFixed(6)}`]
  for (let i = 1; i < ring.length; i++) {
    parts.push(`L${ring[i].x.toFixed(6)},${ring[i].y.toFixed(6)}`)
  }
  parts.push('Z')
  return parts.join(' ')
}

/**
 * Emit polygons as a flat black SVG, matching the Python pipeline's writer:
 * one `<path>` per polygon, exterior + holes concatenated as subpaths inside
 * a single d-string with `fill-rule="evenodd"`. The 5 islands of `fox.canonical.svg`
 * round-trip as 5 separate `<path>` elements through this writer.
 *
 * @param {Polygon[]} polygons
 * @param {{x:number,y:number,w:number,h:number}} viewBox
 * @returns {string}
 */
export function polygonsToSvg(polygons, viewBox) {
  const { x, y, w, h } = viewBox
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="${x} ${y} ${w} ${h}">\n`,
  ]
  for (const poly of polygons) {
    const rings = [ringToD(poly.outer), ...poly.holes.map(ringToD)].filter(Boolean)
    if (rings.length === 0) continue
    const d = rings.join(' ')
    parts.push(`  <path d="${d}" fill="#000000" fill-rule="evenodd"/>\n`)
  }
  parts.push('</svg>\n')
  return parts.join('')
}

/* ---------------- stroke → fill (for line-art SVGs) ---------------- */

/**
 * Walk every stroked path in an SVG, offset each polyline by stroke-width/2
 * via Clipper, union the results, and emit a flat black-fill SVG. Lossless
 * conversion that preserves the source stroke widths exactly — unlike the
 * rasterize-then-trace path which is bitmap-resolution-bound and gets eaten
 * by downstream nozzle rounding.
 *
 * Returns null if no stroked geometry is found (caller can fall back to the
 * raster path for truly empty / pictorial inputs).
 *
 * @param {string} svgText
 * @returns {string|null}
 */
export function strokesToBlackSvg(svgText) {
  const data = new SVGLoader().parse(svgText)

  const offsetPolys = []
  for (const path of data.paths) {
    const style = path.userData?.style || {}
    const stroke = style.stroke
    if (!stroke || stroke === 'none' || stroke === 'transparent') continue
    const strokeWidth = parseFloat(style.strokeWidth) || 0
    if (strokeWidth <= 0) continue
    const halfWidth = strokeWidth / 2

    for (const subPath of path.subPaths) {
      const pts = subPath.getPoints(DEFAULT_CURVE_DIVISIONS)
      if (pts.length < 2) continue

      const clip = pts.map((p) => ({
        X: Math.round(p.x * CLIPPER_SCALE),
        Y: Math.round(p.y * CLIPPER_SCALE),
      }))

      const co = new ClipperLib.ClipperOffset(2.0, 0.25)
      co.AddPath(
        clip,
        ClipperLib.JoinType.jtRound,
        ClipperLib.EndType.etOpenRound
      )
      const solution = new ClipperLib.Paths()
      co.Execute(solution, halfWidth * CLIPPER_SCALE)
      for (const ring of solution) {
        if (ring.length >= 3) offsetPolys.push(ring)
      }
    }
  }

  if (offsetPolys.length === 0) return null

  // Union all stroke ribbons so overlapping ones merge cleanly.
  const clipper = new ClipperLib.Clipper()
  clipper.AddPaths(offsetPolys, ClipperLib.PolyType.ptSubject, true)
  const polyTree = new ClipperLib.PolyTree()
  clipper.Execute(
    ClipperLib.ClipType.ctUnion,
    polyTree,
    ClipperLib.PolyFillType.pftNonZero,
    ClipperLib.PolyFillType.pftNonZero
  )

  const polygons = []
  function walk(node) {
    if (!node) return
    const contour = getContour(node)
    if (!isHole(node) && contour.length >= 3) {
      const outer = clipperPathToPoints(contour)
      const holes = []
      for (const child of getChilds(node)) {
        const cc = getContour(child)
        if (isHole(child) && cc.length >= 3) {
          holes.push(clipperPathToPoints(cc))
        }
        for (const gc of getChilds(child)) walk(gc)
      }
      polygons.push({ outer, holes })
    } else {
      for (const child of getChilds(node)) walk(child)
    }
  }
  for (const child of getChilds(polyTree)) walk(child)

  if (polygons.length === 0) return null

  // Source viewBox so the offset polygons land in the right user-space.
  const doc = new DOMParser().parseFromString(svgText, 'image/svg+xml')
  const root = doc.documentElement
  let viewBox = { x: 0, y: 0, w: 100, h: 100 }
  const vbAttr = root.getAttribute('viewBox')
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      viewBox = { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
    }
  } else {
    const w = parseFloat(root.getAttribute('width') || '0')
    const h = parseFloat(root.getAttribute('height') || '0')
    if (w > 0 && h > 0) viewBox = { x: 0, y: 0, w, h }
  }

  return polygonsToSvg(polygons, viewBox)
}

/* ---------------- small geometry helpers used by chunk 5 ---------------- */

/**
 * Shoelace area of a closed ring (sign indicates orientation).
 */
export function ringArea(ring) {
  if (!ring || ring.length < 3) return 0
  let sum = 0
  for (let i = 0; i < ring.length; i++) {
    const a = ring[i]
    const b = ring[(i + 1) % ring.length]
    sum += a.x * b.y - b.x * a.y
  }
  return sum / 2
}

/**
 * Signed area: outer - sum(holes). Always returns a non-negative number; the
 * call site can interpret the magnitude as "how much black is on the sheet."
 */
export function polygonArea(polygon) {
  const outer = Math.abs(ringArea(polygon.outer))
  const holes = (polygon.holes || []).reduce(
    (acc, h) => acc + Math.abs(ringArea(h)),
    0
  )
  return Math.max(0, outer - holes)
}
