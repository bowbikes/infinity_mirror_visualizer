import { memo, useMemo } from 'react'
import * as THREE from 'three'

import { clipPolygon } from '../utils/svgClip'
import { parseSvgToPolygons } from '../preprocess/svgParse'
import { offsetPolygons } from '../preprocess/manufacturability'

// Cache parsed polygons keyed by raw text — each reflection layer renders
// its own SvgIcon, and without this every layer would re-parse + re-XOR
// the same SVG via clipper. Using parseSvgToPolygons (clipper pftEvenOdd)
// instead of Three.js's path.toShapes(false) avoids winding-heuristic bugs
// that turn ring shapes (dog outline, halo logos) into filled silhouettes
// or fragmented triangles.
const _polygonsCache = new Map()
function getParsedPolygons(svgText) {
  let parsed = _polygonsCache.get(svgText)
  if (!parsed) {
    parsed = parseSvgToPolygons(svgText)
    _polygonsCache.set(svgText, parsed)
  }
  return parsed
}

/**
 * SvgIcon — renders an SVG (preset or uploaded) as a 3D mesh layer.
 *
 * Uploaded SVGs render as a flat ShapeGeometry from the SVG paths with
 * evenodd fill — this matches what the laser actually cuts out of the
 * mirror, so the preview reflects what'll be manufactured. Stroke-only
 * line art needs to be converted to fills upstream (preprocessing pipeline)
 * before it reaches this renderer.
 *
 * Presets (hexagon/circle/star) render as a ring stroke; they're not part
 * of the manufacturing flow, so the stroke look is just visual flavor.
 *
 * Scale: 1 unit = 10mm. Frame-bounded geometry gets clipped via
 * Sutherland-Hodgman so reflections don't bleed past the mirror opening.
 */
function SvgIconImpl({
  shapeType = 'hexagon',
  customSvgPath,
  color = '#00ffff',
  scale = 1,
  rotation = 0,
  position = [0, 0, 0],
  edgeThickness = 0.2,
  layerIndex = 0,
  frameBounds = null // [width, height] of frame opening to clip geometry
}) {

  // Create extruded outline geometry
  const outlineGeometry = useMemo(() => {
    // Custom SVG: render as flat fill via our parseSvgToPolygons → THREE.Shape
    // pipeline. parseSvgToPolygons uses clipper-lib's pftEvenOdd XOR which is
    // winding-direction-independent, unlike Three.js's path.toShapes() which
    // turns ring shapes into filled silhouettes when subpath windings don't
    // match its heuristic. The output is a flat fill matching the laser cut.
    if (shapeType === 'custom' && customSvgPath) {
      try {
        const { polygons } = getParsedPolygons(customSvgPath)
        if (polygons.length === 0) return createFallbackGeometry()

        // Bounds across every ring (outer + holes count for clipping the
        // icon to a consistent target size regardless of source viewBox).
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        for (const poly of polygons) {
          for (const ring of [poly.outer, ...poly.holes]) {
            for (const { x, y } of ring) {
              if (x < minX) minX = x; if (x > maxX) maxX = x
              if (y < minY) minY = y; if (y > maxY) maxY = y
            }
          }
        }
        if (minX === Infinity) return createFallbackGeometry()

        const targetSize = 10
        const maxDim = Math.max(maxX - minX, maxY - minY) || 1
        const scaleFactor = targetSize / maxDim
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Y is flipped here: SVG is Y-down, Three.js scene is Y-up. After
        // the flip the polygon's visual winding reverses, which is exactly
        // what THREE.ShapeGeometry / earcut expects (outer CCW, holes CW
        // in math/right-handed coords).
        const xform = (p) => ({
          x: (p.x - centerX) * scaleFactor,
          y: -(p.y - centerY) * scaleFactor,
        })

        // Move every polygon into scene-space first so the Edge Thickness
        // offset operates in scene units (matching what users see in the
        // preview), not source SVG units which can be arbitrary.
        const sceneSpace = polygons.map((poly) => ({
          outer: poly.outer.map(xform),
          holes: poly.holes.map((hole) => hole.map(xform)),
        }))

        // Edge Thickness for custom SVGs dilates the black areas outward
        // — thin line art gets thicker, solid shapes get bigger. Matches
        // the "thicker edges → more material" reading. Uses the same
        // Clipper-backed offset as the manufacturability pipeline so the
        // join behavior is consistent.
        const working =
          edgeThickness > 0
            ? offsetPolygons(sceneSpace, edgeThickness / 2)
            : sceneSpace

        const geometries = []
        for (const poly of working) {
          const outerClipped = clipPolygon(poly.outer, frameBounds)
          if (outerClipped.length < 3) continue

          const fillShape = new THREE.Shape()
          outerClipped.forEach((p, i) => {
            if (i === 0) fillShape.moveTo(p.x, p.y)
            else fillShape.lineTo(p.x, p.y)
          })
          fillShape.closePath()

          for (const hole of poly.holes) {
            const holeClipped = clipPolygon(hole, frameBounds)
            if (holeClipped.length < 3) continue
            const holePath = new THREE.Path()
            holeClipped.forEach((p, i) => {
              if (i === 0) holePath.moveTo(p.x, p.y)
              else holePath.lineTo(p.x, p.y)
            })
            holePath.closePath()
            fillShape.holes.push(holePath)
          }

          geometries.push(new THREE.ShapeGeometry(fillShape))
        }

        if (geometries.length === 0) return createFallbackGeometry()
        if (geometries.length === 1) return geometries[0]

        // Merge into one BufferGeometry so we render in a single draw call.
        // ShapeGeometry is INDEXED — naïvely concatenating .position arrays
        // throws away the .index buffer and produces a garbage triangle salad
        // (the cyan-triangle-spike artifact). Expand each indexed geometry
        // into a flat triangle list before concatenating.
        const merged = new THREE.BufferGeometry()
        const positions = []
        for (const g of geometries) {
          const posArr = g.attributes.position.array
          const indexArr = g.index ? g.index.array : null
          if (indexArr) {
            for (let i = 0; i < indexArr.length; i++) {
              const vi = indexArr[i] * 3
              positions.push(posArr[vi], posArr[vi + 1], posArr[vi + 2])
            }
          } else {
            for (let i = 0; i < posArr.length; i++) positions.push(posArr[i])
          }
        }
        merged.setAttribute(
          'position',
          new THREE.Float32BufferAttribute(positions, 3)
        )
        return merged
      } catch (error) {
        console.error('Error parsing custom SVG path:', error)
        return createFallbackGeometry()
      }
    }

    function createFallbackGeometry() {
      const fallbackOuter = new THREE.Shape()
      const fallbackInner = new THREE.Shape()
      const outerR = 5 + edgeThickness / 2
      const innerR = 5 - edgeThickness / 2

      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
        if (i === 0) {
          fallbackOuter.moveTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR)
        } else {
          fallbackOuter.lineTo(Math.cos(angle) * outerR, Math.sin(angle) * outerR)
        }
      }
      fallbackOuter.closePath()

      for (let i = 0; i < 6; i++) {
        const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
        if (i === 0) {
          fallbackInner.moveTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR)
        } else {
          fallbackInner.lineTo(Math.cos(angle) * innerR, Math.sin(angle) * innerR)
        }
      }
      fallbackInner.closePath()
      fallbackOuter.holes.push(fallbackInner)

      return new THREE.ShapeGeometry(fallbackOuter)
    }

    // Create inner and outer shapes for the stroke
    const innerRadius = 5 - edgeThickness / 2
    const outerRadius = 5 + edgeThickness / 2

    let outerPoints = []
    let innerPoints = []

    switch (shapeType) {
      case 'hexagon': {
        // Generate hexagon points
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
          outerPoints.push({
            x: Math.cos(angle) * outerRadius,
            y: Math.sin(angle) * outerRadius
          })
          innerPoints.push({
            x: Math.cos(angle) * innerRadius,
            y: Math.sin(angle) * innerRadius
          })
        }
        break
      }

      case 'circle': {
        // Generate circle points
        const segments = 64
        for (let i = 0; i < segments; i++) {
          const angle = (i * Math.PI * 2) / segments
          outerPoints.push({
            x: Math.cos(angle) * outerRadius,
            y: Math.sin(angle) * outerRadius
          })
          innerPoints.push({
            x: Math.cos(angle) * innerRadius,
            y: Math.sin(angle) * innerRadius
          })
        }
        break
      }

      case 'star': {
        const outerStarRadius = outerRadius
        const innerStarRadius = 2
        const outerStarRadiusInner = innerRadius
        const innerStarRadiusInner = 2 - edgeThickness / 2

        for (let i = 0; i < 10; i++) {
          const radiusOuter = i % 2 === 0 ? outerStarRadius : innerStarRadius
          const radiusInner = i % 2 === 0 ? outerStarRadiusInner : Math.max(innerStarRadiusInner, 0.1)
          const angle = (i * Math.PI) / 5 - Math.PI / 2
          outerPoints.push({
            x: Math.cos(angle) * radiusOuter,
            y: Math.sin(angle) * radiusOuter
          })
          innerPoints.push({
            x: Math.cos(angle) * radiusInner,
            y: Math.sin(angle) * radiusInner
          })
        }
        break
      }

      default: {
        // Default circle
        const segments = 64
        for (let i = 0; i < segments; i++) {
          const angle = (i * Math.PI * 2) / segments
          outerPoints.push({
            x: Math.cos(angle) * outerRadius,
            y: Math.sin(angle) * outerRadius
          })
          innerPoints.push({
            x: Math.cos(angle) * innerRadius,
            y: Math.sin(angle) * innerRadius
          })
        }
      }
    }

    // Apply clipping to preset shapes if frameBounds provided
    if (frameBounds) {
      outerPoints = clipPolygon(outerPoints, frameBounds)
      innerPoints = clipPolygon(innerPoints, frameBounds)
    }

    // Build shapes from clipped points
    const outerShape = new THREE.Shape()
    const innerShape = new THREE.Shape()

    if (outerPoints.length >= 3) {
      outerPoints.forEach((p, i) => {
        if (i === 0) outerShape.moveTo(p.x, p.y)
        else outerShape.lineTo(p.x, p.y)
      })
      outerShape.closePath()
    }

    if (innerPoints.length >= 3) {
      innerPoints.forEach((p, i) => {
        if (i === 0) innerShape.moveTo(p.x, p.y)
        else innerShape.lineTo(p.x, p.y)
      })
      innerShape.closePath()

      // Only add inner shape as hole if we have valid points
      outerShape.holes.push(innerShape)
    }

    // Create flat geometry with the stroke outline
    return new THREE.ShapeGeometry(outerShape)
  }, [shapeType, customSvgPath, edgeThickness, frameBounds])

  // Calculate emissive intensity based on color hue.
  // Only the first layer (layerIndex === 0) is emissive; reflections are not.
  //
  // LEDs of equal physical brightness don't appear equally bright to the eye —
  // yellows and greens (around 60°) look punchier than blues (240°). This
  // fudges the emissive multiplier by hue so different colors land at a
  // similar perceived brightness in the rendered scene. All constants are
  // hand-tuned against the bloom pipeline; kept inline so the per-render
  // path doesn't pull from a shared scratch object (extraction broke
  // perceptual uniformity in practice).
  const emissiveIntensity = useMemo(() => {
    if (layerIndex !== 0) return 0

    const intensity_factor = 0.80
    const minIntensity = 2.5

    const peakBoost = 9.0
    const peakSigmaDeg = 40.0

    // soften the dip so 44–70° isn't overly dim
    const dipBoost = 1.4
    const dipSigmaDeg = 35.0

    // gently lift reds so 324–30° stays consistent
    const redLiftBoost = 1.75
    const redLiftSigmaDeg = 55.0

    // lightness handling
    const dark_boost = 16.67
    const light_reduce = 0.88

    const c = new THREE.Color(color)
    const hsl = {}
    c.getHSL(hsl)

    const hueDeg = ((hsl.h * 360) % 360 + 360) % 360

    const circDist = (a, b) => {
      const d = Math.abs(a - b)
      return Math.min(d, 360 - d)
    }

    const gaussian = (dist, sigma) => Math.exp(-0.5 * (dist / sigma) * (dist / sigma))

    const d240 = circDist(hueDeg, 240)
    const d60  = circDist(hueDeg, 60)
    const d0   = circDist(hueDeg, 0)

    const peak = peakBoost * gaussian(d240, peakSigmaDeg)
    const dip  = dipBoost  * gaussian(d60,  dipSigmaDeg)
    const redLift = redLiftBoost * gaussian(d0, redLiftSigmaDeg)

    let baseIntensity = minIntensity + peak + redLift - dip

    if (hsl.l < 0.3) {
      baseIntensity += (0.3 - hsl.l) * dark_boost
    } else if (hsl.l > 0.7) {
      baseIntensity *= light_reduce
    }

    baseIntensity = Math.max(0, baseIntensity)
    return baseIntensity * intensity_factor
  }, [color, layerIndex])

  return (
    <group position={position} rotation={[0, 0, rotation]} scale={scale}>
      <mesh geometry={outlineGeometry}>
        <meshStandardMaterial
          color={color}
          emissive={color}
          emissiveIntensity={emissiveIntensity}
          side={THREE.DoubleSide}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}

// memo so the camera-orbit/state-tick re-renders of the scene tree don't
// rebuild the (often expensive) geometry. All array props (frameBounds,
// position) are stabilized upstream so shallow-equal is sufficient.
const SvgIcon = memo(SvgIconImpl)
export default SvgIcon
