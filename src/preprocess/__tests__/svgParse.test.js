/**
 * Unit tests for the svg_parse port. These are focused on the parser itself,
 * not the end-to-end pipeline parity (that lives in parity.test.js).
 *
 * Fixtures come from `npm run sync-fixtures`.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  parseSvgToPolygons,
  polygonsToSvg,
  polygonArea,
  ringArea,
} from '../svgParse.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')

function loadFixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

describe('parseSvgToPolygons', () => {
  it('parses demo_W_black: 1 polygon, 1 hole (W-silhouette inside halo)', () => {
    const { polygons, viewBox } = parseSvgToPolygons(loadFixture('demo_W_black.svg'))
    expect(polygons).toHaveLength(1)
    expect(polygons[0].holes).toHaveLength(1)
    expect(polygons[0].outer.length).toBeGreaterThan(8)
    expect(viewBox.w).toBeGreaterThan(0)
    expect(viewBox.h).toBeGreaterThan(0)
  })

  it('parses nested_holes: 2 islands per evenodd parity (disc+hole + inner disc)', () => {
    // Python's `load_cut_polygon` returns 2 islands AND normalizes to mm — its
    // reported areas (4786 / 491) are post-scale. The JS port deliberately
    // stays in source SVG coords so the parity tests can compare structure
    // without normalization noise; the visualizer's 3D scene normalizes
    // downstream when consuming the SVG.
    //
    // Theoretical areas in source coords (r in SVG units):
    //   big disc-with-hole = π·80² - π·50² ≈ 12252
    //   inner disc         = π·20²         ≈ 1257
    // Bézier sampling of the circular arcs slightly under-approximates.
    const { polygons } = parseSvgToPolygons(loadFixture('nested_holes.svg'))
    expect(polygons).toHaveLength(2)

    const sorted = polygons.slice().sort((a, b) => polygonArea(b) - polygonArea(a))
    expect(sorted[0].holes).toHaveLength(1)        // big disc with annulus hole
    expect(sorted[1].holes).toHaveLength(0)        // inner solid disc
    expect(polygonArea(sorted[0])).toBeGreaterThan(12000)
    expect(polygonArea(sorted[0])).toBeLessThan(12500)
    expect(polygonArea(sorted[1])).toBeGreaterThan(1200)
    expect(polygonArea(sorted[1])).toBeLessThan(1300)
  })

  it('parses Washington_Huskies canonical (gold halo extracted): 1 polygon with holes', () => {
    const { polygons } = parseSvgToPolygons(
      loadFixture('Washington_Huskies_logo.canonical.svg')
    )
    expect(polygons.length).toBeGreaterThanOrEqual(1)
    // The gold halo has interior cutouts (the W-shape negative space). At
    // least one polygon should carry holes.
    const polysWithHoles = polygons.filter((p) => p.holes.length > 0)
    expect(polysWithHoles.length).toBeGreaterThanOrEqual(1)
  })

  it('preserves source viewBox', () => {
    const { viewBox } = parseSvgToPolygons(loadFixture('nested_holes.svg'))
    expect(viewBox).toEqual({ x: 0, y: 0, w: 200, h: 200 })
  })

  it('parses empty SVG without crashing', () => {
    const { polygons } = parseSvgToPolygons(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"></svg>'
    )
    expect(polygons).toHaveLength(0)
  })
})

describe('polygonsToSvg', () => {
  it('round-trips a single polygon with one hole', () => {
    const polys = [
      {
        outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        holes: [[{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }]],
      },
    ]
    const svg = polygonsToSvg(polys, { x: 0, y: 0, w: 10, h: 10 })
    expect(svg).toContain('<path')
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain('fill-rule="evenodd"')
    // Re-parse and confirm the structure survives.
    const { polygons: rt } = parseSvgToPolygons(svg)
    expect(rt).toHaveLength(1)
    expect(rt[0].holes).toHaveLength(1)
  })

  it('uses the provided viewBox', () => {
    const svg = polygonsToSvg([], { x: 5, y: 6, w: 100, h: 200 })
    expect(svg).toContain('viewBox="5 6 100 200"')
  })
})

describe('area helpers', () => {
  it('ringArea uses the shoelace formula (positive for CCW, negative for CW)', () => {
    const ccw = [{ x: 0, y: 0 }, { x: 4, y: 0 }, { x: 4, y: 3 }, { x: 0, y: 3 }]
    const cw = ccw.slice().reverse()
    expect(ringArea(ccw)).toBeCloseTo(12, 5)
    expect(ringArea(cw)).toBeCloseTo(-12, 5)
  })

  it('polygonArea subtracts hole areas from the outer ring', () => {
    const poly = {
      outer: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
      holes: [[{ x: 3, y: 3 }, { x: 7, y: 3 }, { x: 7, y: 7 }, { x: 3, y: 7 }]],
    }
    // outer 100 - hole 16 = 84
    expect(polygonArea(poly)).toBeCloseTo(84, 5)
  })
})
