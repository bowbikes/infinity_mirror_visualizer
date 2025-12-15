import { useMemo } from 'react'
import * as THREE from 'three'
import { SVGLoader } from 'three/examples/jsm/loaders/SVGLoader'

/**
 * SvgIcon component - Renders a simple geometric shape outline/edge
 *
 * Scale assumption: 1 unit = 10mm
 * The icon is positioned on the inner mirror plane facing the user
 *
 * Note: Using simple shapes instead of SVG parsing for better compatibility
 */
export default function SvgIcon({
  shapeType = 'hexagon',
  customSvgPath,
  svgRenderMode = 'outline',
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
    // Helper to check if a point is within bounds
    const isInBounds = (p, bounds) => {
      if (!bounds) return true

      const halfWidth = bounds[0] / 2
      const halfHeight = bounds[1] / 2

      return p.x >= -halfWidth && p.x <= halfWidth &&
             p.y >= -halfHeight && p.y <= halfHeight
    }

    // Cohen-Sutherland line clipping algorithm
    // Clips a line segment to a rectangular boundary
    const clipLineSegment = (p1, p2, bounds) => {
      if (!bounds) return [p1, p2]

      const halfWidth = bounds[0] / 2
      const halfHeight = bounds[1] / 2

      const INSIDE = 0 // 0000
      const LEFT = 1   // 0001
      const RIGHT = 2  // 0010
      const BOTTOM = 4 // 0100
      const TOP = 8    // 1000

      const computeOutCode = (p) => {
        let code = INSIDE
        if (p.x < -halfWidth) code |= LEFT
        else if (p.x > halfWidth) code |= RIGHT
        if (p.y < -halfHeight) code |= BOTTOM
        else if (p.y > halfHeight) code |= TOP
        return code
      }

      let x1 = p1.x, y1 = p1.y
      let x2 = p2.x, y2 = p2.y
      let outcode1 = computeOutCode({x: x1, y: y1})
      let outcode2 = computeOutCode({x: x2, y: y2})
      let accept = false

      while (true) {
        if (!(outcode1 | outcode2)) {
          // Both points inside
          accept = true
          break
        } else if (outcode1 & outcode2) {
          // Both points outside same region - reject
          break
        } else {
          // Line crosses boundary - clip it
          let x, y
          const outcodeOut = outcode1 ? outcode1 : outcode2

          if (outcodeOut & TOP) {
            x = x1 + (x2 - x1) * (halfHeight - y1) / (y2 - y1)
            y = halfHeight
          } else if (outcodeOut & BOTTOM) {
            x = x1 + (x2 - x1) * (-halfHeight - y1) / (y2 - y1)
            y = -halfHeight
          } else if (outcodeOut & RIGHT) {
            y = y1 + (y2 - y1) * (halfWidth - x1) / (x2 - x1)
            x = halfWidth
          } else if (outcodeOut & LEFT) {
            y = y1 + (y2 - y1) * (-halfWidth - x1) / (x2 - x1)
            x = -halfWidth
          }

          if (outcodeOut === outcode1) {
            x1 = x
            y1 = y
            outcode1 = computeOutCode({x: x1, y: y1})
          } else {
            x2 = x
            y2 = y
            outcode2 = computeOutCode({x: x2, y: y2})
          }
        }
      }

      if (accept) {
        return [{x: x1, y: y1}, {x: x2, y: y2}]
      }
      return null // Line segment completely outside bounds
    }

    // Clip a polygon path to frame bounds using Sutherland-Hodgman algorithm
    const clipPolygon = (points, bounds) => {
      if (!bounds || points.length < 2) return points

      const halfWidth = bounds[0] / 2
      const halfHeight = bounds[1] / 2

      let output = [...points]

      // Clip against each edge: left, right, bottom, top
      const clipEdges = [
        { edge: 'left', inside: (p) => p.x >= -halfWidth,
          intersect: (p1, p2) => ({
            x: -halfWidth,
            y: p1.y + (p2.y - p1.y) * (-halfWidth - p1.x) / (p2.x - p1.x)
          })},
        { edge: 'right', inside: (p) => p.x <= halfWidth,
          intersect: (p1, p2) => ({
            x: halfWidth,
            y: p1.y + (p2.y - p1.y) * (halfWidth - p1.x) / (p2.x - p1.x)
          })},
        { edge: 'bottom', inside: (p) => p.y >= -halfHeight,
          intersect: (p1, p2) => ({
            x: p1.x + (p2.x - p1.x) * (-halfHeight - p1.y) / (p2.y - p1.y),
            y: -halfHeight
          })},
        { edge: 'top', inside: (p) => p.y <= halfHeight,
          intersect: (p1, p2) => ({
            x: p1.x + (p2.x - p1.x) * (halfHeight - p1.y) / (p2.y - p1.y),
            y: halfHeight
          })}
      ]

      for (const {inside, intersect} of clipEdges) {
        if (output.length === 0) break

        const input = output
        output = []

        for (let i = 0; i < input.length; i++) {
          const current = input[i]
          const next = input[(i + 1) % input.length]

          const currentInside = inside(current)
          const nextInside = inside(next)

          if (currentInside) {
            output.push(current)
            if (!nextInside) {
              output.push(intersect(current, next))
            }
          } else if (nextInside) {
            output.push(intersect(current, next))
          }
        }
      }

      return output
    }

    // Handle custom SVG path
    if (shapeType === 'custom' && customSvgPath) {
      try {
        // Create an SVGLoader instance
        const loader = new SVGLoader()

        // Parse the full SVG string (which may contain path, line, polyline, etc.)
        const svgData = loader.parse(customSvgPath)

        // Calculate bounds across ALL paths and detect if SVG uses strokes
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
        let hasStroke = false
        let hasFill = false

        // First pass: detect stroke/fill and calculate bounds
        svgData.paths.forEach(path => {
          // Check if this path has stroke or fill
          const style = path.userData?.style || {}

          // Detect stroke - must be explicitly set
          if (style.stroke && style.stroke !== 'none' && style.stroke !== 'transparent') {
            const strokeWidth = parseFloat(style.strokeWidth) || 1
            if (strokeWidth > 0.5) { // Ignore very thin decorative strokes
              hasStroke = true
            }
          }

          // Detect fill - if not explicitly set to 'none', assume it's filled
          // This handles SVGs without explicit fill attributes (like test-heart.svg)
          const fillValue = style.fill
          if (fillValue === undefined || (fillValue && fillValue !== 'none' && fillValue !== 'transparent')) {
            hasFill = true
          }

          // Get bounds from subPaths (works for lines, polylines, paths)
          path.subPaths.forEach(subPath => {
            const points = subPath.getPoints()
            points.forEach(p => {
              minX = Math.min(minX, p.x)
              maxX = Math.max(maxX, p.x)
              minY = Math.min(minY, p.y)
              maxY = Math.max(maxY, p.y)
            })
          })
        })

        const width = maxX - minX
        const height = maxY - minY
        const maxDim = Math.max(width, height)
        const targetSize = 10
        const scaleFactor = targetSize / maxDim
        const centerX = (minX + maxX) / 2
        const centerY = (minY + maxY) / 2

        // Choose rendering mode based on SVG content
        // If SVG has strokes (like snowflake), use tube/extrude rendering
        // If it has fills or user chose fill mode, use fill rendering
        const useStrokeRendering = (hasStroke && !hasFill) || svgRenderMode === 'stroke'

        if (useStrokeRendering) {
          // Stroke rendering - create simple flat rectangles for each line segment
          const geometries = []

          svgData.paths.forEach((path) => {
            path.subPaths.forEach((subPath) => {
              const points = subPath.getPoints()
              if (points.length < 2) return

              // Transform points
              const transformedPoints = points.map(p => ({
                x: (p.x - centerX) * scaleFactor,
                y: -(p.y - centerY) * scaleFactor
              }))

              // Create flat rectangular strips for each line segment with clipping
              const halfWidth = edgeThickness * 0.5

              for (let i = 0; i < transformedPoints.length - 1; i++) {
                const p1 = transformedPoints[i]
                const p2 = transformedPoints[i + 1]

                // Clip line segment to frame bounds
                const clipped = clipLineSegment(p1, p2, frameBounds)
                if (!clipped) continue // Line segment completely outside bounds

                const start = new THREE.Vector3(clipped[0].x, clipped[0].y, 0)
                const end = new THREE.Vector3(clipped[1].x, clipped[1].y, 0)

                // Calculate perpendicular direction for line width
                const dx = end.x - start.x
                const dy = end.y - start.y
                const length = Math.sqrt(dx * dx + dy * dy)

                if (length < 0.001) continue // Skip zero-length segments

                // Perpendicular direction (rotated 90 degrees in 2D)
                const perpX = -dy / length
                const perpY = dx / length

                // Create rectangular geometry for this segment using BufferGeometry
                const positions = new Float32Array([
                  // Triangle 1
                  start.x + perpX * halfWidth, start.y + perpY * halfWidth, 0,
                  start.x - perpX * halfWidth, start.y - perpY * halfWidth, 0,
                  end.x - perpX * halfWidth, end.y - perpY * halfWidth, 0,
                  // Triangle 2
                  start.x + perpX * halfWidth, start.y + perpY * halfWidth, 0,
                  end.x - perpX * halfWidth, end.y - perpY * halfWidth, 0,
                  end.x + perpX * halfWidth, end.y + perpY * halfWidth, 0
                ])

                const segmentGeometry = new THREE.BufferGeometry()
                segmentGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
                segmentGeometry.computeVertexNormals()

                geometries.push(segmentGeometry)
              }
            })
          })

          console.log(`Created ${geometries.length} line segment geometries`)

          if (geometries.length === 0) {
            return createFallbackGeometry()
          }

          // Merge all geometries efficiently
          const mergedGeometry = new THREE.BufferGeometry()
          const mergedPositions = []

          geometries.forEach(geo => {
            const positions = geo.attributes.position.array
            for (let i = 0; i < positions.length; i++) {
              mergedPositions.push(positions[i])
            }
          })

          mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3))
          mergedGeometry.computeVertexNormals()

          return mergedGeometry
        } else {
          // Fill rendering - use even-odd winding for proper hole handling
          let allShapes = []
          svgData.paths.forEach(path => {
            // Use even-odd fill rule (false) for proper handling of internal cutouts
            const pathShapes = path.toShapes(false)
            allShapes = allShapes.concat(pathShapes)
          })

          if (allShapes.length === 0) {
            return createFallbackGeometry()
          }

          const geometries = []

          allShapes.forEach(shape => {
            const points = shape.getPoints()
            if (points.length < 3) return

            const fillShape = new THREE.Shape()

            // Transform points (scale, center, flip Y)
            const transformedPoints = points.map(p => ({
              x: (p.x - centerX) * scaleFactor,
              y: -(p.y - centerY) * scaleFactor
            }))

            // Clip polygon to frame bounds
            const clippedPoints = clipPolygon(transformedPoints, frameBounds)
            if (clippedPoints.length < 3) return // Not enough points after clipping

            clippedPoints.forEach((p, i) => {
              if (i === 0) fillShape.moveTo(p.x, p.y)
              else fillShape.lineTo(p.x, p.y)
            })
            fillShape.closePath()

            // Preserve holes from the original shape
            if (shape.holes && shape.holes.length > 0) {
              shape.holes.forEach(hole => {
                const holePoints = hole.getPoints()
                if (holePoints.length < 3) return

                const holeShape = new THREE.Path()

                const transformedHolePoints = holePoints.map(p => ({
                  x: (p.x - centerX) * scaleFactor,
                  y: -(p.y - centerY) * scaleFactor
                }))

                // Clip hole polygon to frame bounds
                const clippedHolePoints = clipPolygon(transformedHolePoints, frameBounds)
                if (clippedHolePoints.length < 3) return // Not enough points after clipping

                clippedHolePoints.forEach((p, i) => {
                  if (i === 0) holeShape.moveTo(p.x, p.y)
                  else holeShape.lineTo(p.x, p.y)
                })
                holeShape.closePath()
                fillShape.holes.push(holeShape)
              })
            }

            if (svgRenderMode === 'outline') {
              // For outline mode, use THREE's ExtrudeGeometry with bevelEnabled to create strokes
              // This gives us clean, consistent strokes without manual offset calculations
              const extrudeSettings = {
                depth: 0.01,  // Minimal Z depth
                bevelEnabled: true,
                bevelThickness: edgeThickness * 0.05,  // Controls stroke width
                bevelSize: edgeThickness * 0.05,
                bevelSegments: 1
              }

              geometries.push(new THREE.ExtrudeGeometry(fillShape, extrudeSettings))
            } else {
              // Fill mode: show the filled shape
              geometries.push(new THREE.ShapeGeometry(fillShape))
            }
          })

          // Merge all geometries into one
          if (geometries.length === 1) {
            return geometries[0]
          } else {
            const mergedGeometry = new THREE.BufferGeometry()
            const mergedPositions = []

            geometries.forEach(geo => {
              const positions = geo.attributes.position.array
              for (let i = 0; i < positions.length; i++) {
                mergedPositions.push(positions[i])
              }
            })

            mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3))
            return mergedGeometry
          }
        }
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
  }, [shapeType, customSvgPath, svgRenderMode, edgeThickness, frameBounds])

  // Calculate emissive intensity based on color hue
  // Only the FIRST layer (layerIndex === 0) should be emissive
  // All reflection layers should be non-emissive
  const emissiveIntensity = useMemo(() => {
  if (layerIndex !== 0) return 0

  // --- tuning knobs ---
  const intensity_factor = 0.80

  const minIntensity = 2.5

  const peakBoost = 9.0
  const peakSigmaDeg = 40.0

  // soften the dip so 44–70° isn't overly dim
  const dipBoost = 1.4       // was ~2.5
  const dipSigmaDeg = 35.0   // was ~25 (wider + shallower)

  // optional: gently lift reds so 324–30 stays consistent
  const redLiftBoost = 1.75
  const redLiftSigmaDeg = 55.0

  // lightness handling
  const dark_boost = 16.67
  const light_reduce = 0.88  // was 0.7 (less aggressive)

  const c = new THREE.Color(color)
  const hsl = {}
  c.getHSL(hsl)

  const hueDeg = ((hsl.h * 360) % 360 + 360) % 360

  const circDist = (a, b) => {
    const d = Math.abs(a - b)
    return Math.min(d, 360 - d) // always 0..180
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
