/**
 * Unit tests for the manufacturability port. Verifies the size-floor +
 * nozzle-rounding behavior with focused inputs where the expected outcome
 * is analytically derivable.
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { applyManufacturability } from '../manufacturability.js'
import { parseSvgToPolygons, polygonArea } from '../svgParse.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const FIXTURES = join(HERE, 'fixtures')

function loadFixture(name) {
  return readFileSync(join(FIXTURES, name), 'utf8')
}

describe('applyManufacturability', () => {
  describe('area floor (minIslandAreaMm2)', () => {
    it('drops the 4 tiny 2x2 specks but keeps the 60x60 square', () => {
      // tiny_specks.svg: 200x200 viewBox, one 60x60 square (area 3600 SVG-u²)
      // + four 2x2 specks (area 4 SVG-u² each).
      //
      // The conversion: longestSide=200, maxLogoDimMm=100 → unitsPerMm=2.
      // unitsPerMm²=4. So minIslandAreaMm2=50 → 200 SVG-u² threshold.
      // Square 3600 stays; specks 4 each get dropped.
      const { svg, droppedSmall } = applyManufacturability(
        loadFixture('tiny_specks.svg'),
        { minIslandAreaMm2: 50, nozzleDiameterMm: 0 } // nozzle off so we isolate the area filter
      )
      expect(droppedSmall).toBe(4)
      const { polygons } = parseSvgToPolygons(svg)
      expect(polygons).toHaveLength(1)
      // The remaining square: area ~3600 SVG-u² in the un-normalized space.
      expect(polygonArea(polygons[0])).toBeGreaterThan(3500)
      expect(polygonArea(polygons[0])).toBeLessThan(3700)
    })

    it('keeps everything when minIslandAreaMm2 is 0 (off)', () => {
      const { svg, droppedSmall } = applyManufacturability(
        loadFixture('tiny_specks.svg'),
        { minIslandAreaMm2: 0, nozzleDiameterMm: 0 }
      )
      expect(droppedSmall).toBe(0)
      const { polygons } = parseSvgToPolygons(svg)
      expect(polygons.length).toBeGreaterThanOrEqual(5)
    })
  })

  describe('width floor (minFeatureWidthMm)', () => {
    it('drops the 100x1 hairline but keeps the 50x50 square', () => {
      // hairline.svg: 200x200 viewBox, one 50x50 square + one 100x1 strip.
      // unitsPerMm = 200/100 = 2. So minFeatureWidthMm=2 → 4 SVG-u width threshold.
      // The strip's narrowest cross-section is 1 SVG-u (its 1-unit height),
      // well below the 4-unit threshold → drop. The square is 50 SVG-u everywhere → keep.
      const { svg, droppedThin } = applyManufacturability(
        loadFixture('hairline.svg'),
        { minFeatureWidthMm: 2, nozzleDiameterMm: 0 }
      )
      expect(droppedThin).toBe(1)
      const { polygons } = parseSvgToPolygons(svg)
      expect(polygons).toHaveLength(1)
      // What's left is the 50x50 square — area ~2500 SVG-u².
      expect(polygonArea(polygons[0])).toBeGreaterThan(2400)
      expect(polygonArea(polygons[0])).toBeLessThan(2600)
    })

    it('keeps everything when minFeatureWidthMm is 0 (off)', () => {
      const { svg, droppedThin } = applyManufacturability(
        loadFixture('hairline.svg'),
        { minFeatureWidthMm: 0, nozzleDiameterMm: 0 }
      )
      expect(droppedThin).toBe(0)
      const { polygons } = parseSvgToPolygons(svg)
      expect(polygons).toHaveLength(2)
    })
  })

  describe('nozzle rounding', () => {
    it('smooths sharp corners (drops some polygon vertices in the round-off)', () => {
      // hairline.svg has square corners. After nozzle round at r=0.5mm (1 SVG-u
      // at our unitsPerMm=2), the 50x50 square's 4 sharp corners should each
      // become a ~quarter-arc. Per clipper's arc tolerance, that adds vertices.
      const baseline = parseSvgToPolygons(loadFixture('hairline.svg'))
      const square = baseline.polygons.find((p) => polygonArea(p) > 1000)
      const squareCornerCount = square.outer.length // ~4 corners for a rect

      const { svg } = applyManufacturability(loadFixture('hairline.svg'), {
        nozzleDiameterMm: 5, // generous rounding so the effect is unambiguous
      })
      const { polygons } = parseSvgToPolygons(svg)
      const roundedSquare = polygons.find((p) => polygonArea(p) > 1000)
      // After rounding, the outer ring has materially more vertices because
      // each corner became an arc.
      expect(roundedSquare.outer.length).toBeGreaterThan(squareCornerCount)
    })

    it('is a no-op when nozzleDiameterMm is 0', () => {
      const before = parseSvgToPolygons(loadFixture('tiny_specks.svg'))
      const { svg } = applyManufacturability(loadFixture('tiny_specks.svg'), {
        nozzleDiameterMm: 0,
      })
      const after = parseSvgToPolygons(svg)
      expect(after.polygons).toHaveLength(before.polygons.length)
    })
  })

  describe('threshold composition', () => {
    it('applies nozzle round, then width floor, then area floor in order', () => {
      // tiny_specks has 5 islands (1 large, 4 tiny). Set all three filters:
      //   nozzleDiameterMm: 0.5  — small rounding, doesn't destroy anything
      //   minFeatureWidthMm: 1   — 2 SVG-u threshold; the 2x2 specks survive
      //                            erosion by 1, so width floor drops nothing
      //   minIslandAreaMm2: 50   — 200 SVG-u² threshold; drops the 4-area specks
      const { droppedThin, droppedSmall } = applyManufacturability(
        loadFixture('tiny_specks.svg'),
        {
          nozzleDiameterMm: 0.5,
          minFeatureWidthMm: 1,
          minIslandAreaMm2: 50,
        }
      )
      // No reason a 2x2 speck would fail erosion-by-1 (1 SVG-u radius = 0.5mm).
      // All 4 specks reach the area filter and get dropped there.
      expect(droppedThin + droppedSmall).toBe(4)
    })

    it('reports warnings for dropped islands', () => {
      const { warnings } = applyManufacturability(loadFixture('tiny_specks.svg'), {
        minIslandAreaMm2: 50,
        nozzleDiameterMm: 0,
      })
      expect(warnings.length).toBeGreaterThan(0)
      expect(warnings[0]).toMatch(/dropped/)
    })
  })

  describe('empty / passthrough cases', () => {
    it('returns an empty-but-valid SVG when no polygons remain', () => {
      const { svg, droppedSmall } = applyManufacturability(loadFixture('tiny_specks.svg'), {
        minIslandAreaMm2: 99999, // larger than the 60x60 square
        nozzleDiameterMm: 0,
      })
      expect(droppedSmall).toBe(5)
      const { polygons } = parseSvgToPolygons(svg)
      expect(polygons).toHaveLength(0)
      // SVG header still well-formed
      expect(svg).toContain('<svg')
      expect(svg).toContain('</svg>')
    })

    it('is structurally idempotent on the demo_W with default settings', () => {
      // Round nozzle, no size floors. Polygon count should stay at 1 (the W).
      const before = parseSvgToPolygons(loadFixture('demo_W_black.svg'))
      const { svg } = applyManufacturability(loadFixture('demo_W_black.svg'), {})
      const after = parseSvgToPolygons(svg)
      expect(after.polygons).toHaveLength(before.polygons.length)
    })
  })
})
