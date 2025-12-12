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
  edgeThickness = 0.2
}) {

  // Create extruded outline geometry
  const outlineGeometry = useMemo(() => {
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
          // Stroke rendering - create tubes ONLY for line-based SVGs
          const geometries = []

          svgData.paths.forEach((path, pathIndex) => {
            path.subPaths.forEach((subPath, subIndex) => {
              const points = subPath.getPoints()
              if (points.length < 2) return

              // Transform points
              const transformedPoints = points.map(p => new THREE.Vector3(
                (p.x - centerX) * scaleFactor,
                -(p.y - centerY) * scaleFactor,
                0
              ))

              // For polylines (≤10 points), create flat rectangular strips for each segment
              // For smooth curves (>10 points), create outline using extrusion
              if (transformedPoints.length <= 10) {
                // Polyline - create flat rectangular strips for each line segment
                for (let i = 0; i < transformedPoints.length - 1; i++) {
                  const start = transformedPoints[i]
                  const end = transformedPoints[i + 1]

                  // Calculate perpendicular offset for the line width
                  const dx = end.x - start.x
                  const dy = end.y - start.y
                  const length = Math.sqrt(dx * dx + dy * dy)

                  if (length < 0.001) continue // Skip zero-length segments

                  // Perpendicular direction (rotated 90 degrees)
                  const perpX = -dy / length
                  const perpY = dx / length

                  const halfWidth = edgeThickness * 0.5

                  // Create 4 corners of the rectangle
                  const p1 = new THREE.Vector3(start.x + perpX * halfWidth, start.y + perpY * halfWidth, 0)
                  const p2 = new THREE.Vector3(start.x - perpX * halfWidth, start.y - perpY * halfWidth, 0)
                  const p3 = new THREE.Vector3(end.x - perpX * halfWidth, end.y - perpY * halfWidth, 0)
                  const p4 = new THREE.Vector3(end.x + perpX * halfWidth, end.y + perpY * halfWidth, 0)

                  // Create shape for this line segment
                  const lineShape = new THREE.Shape()
                  lineShape.moveTo(p1.x, p1.y)
                  lineShape.lineTo(p2.x, p2.y)
                  lineShape.lineTo(p3.x, p3.y)
                  lineShape.lineTo(p4.x, p4.y)
                  lineShape.closePath()

                  geometries.push(new THREE.ShapeGeometry(lineShape))
                }
              } else {
                // Smooth curve - create outline by offsetting the path
                // Convert to 2D points for shape creation
                const points2D = transformedPoints.map(p => new THREE.Vector2(p.x, p.y))

                // Create offset paths for inner and outer edges
                const halfWidth = edgeThickness * 0.5
                const outerPoints = []
                const innerPoints = []

                for (let i = 0; i < points2D.length; i++) {
                  const prevIdx = (i - 1 + points2D.length) % points2D.length
                  const nextIdx = (i + 1) % points2D.length

                  const prev = points2D[prevIdx]
                  const curr = points2D[i]
                  const next = points2D[nextIdx]

                  // Calculate average perpendicular direction
                  const dx1 = curr.x - prev.x
                  const dy1 = curr.y - prev.y
                  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 1

                  const dx2 = next.x - curr.x
                  const dy2 = next.y - curr.y
                  const len2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 1

                  // Average perpendicular
                  const perpX = (-dy1 / len1 - dy2 / len2) * 0.5
                  const perpY = (dx1 / len1 + dx2 / len2) * 0.5
                  const perpLen = Math.sqrt(perpX * perpX + perpY * perpY) || 1

                  outerPoints.push(new THREE.Vector2(
                    curr.x + (perpX / perpLen) * halfWidth,
                    curr.y + (perpY / perpLen) * halfWidth
                  ))
                  innerPoints.push(new THREE.Vector2(
                    curr.x - (perpX / perpLen) * halfWidth,
                    curr.y - (perpY / perpLen) * halfWidth
                  ))
                }

                // Create shape with outer path and inner hole
                const curveShape = new THREE.Shape(outerPoints)
                if (subPath.closed) {
                  curveShape.holes.push(new THREE.Path(innerPoints))
                }

                geometries.push(new THREE.ShapeGeometry(curveShape))
              }
            })
          })

          console.log(`Created ${geometries.length} tube geometries`)

          // Don't add filled shapes in stroke mode - it creates unwanted geometry
          // Stroke mode is ONLY for line-based SVGs (snowflakes, wireframes)

          if (geometries.length === 0) {
            return createFallbackGeometry()
          }

          // Merge all geometries
          if (geometries.length === 1) {
            return geometries[0]
          } else {
            const mergedGeometry = new THREE.BufferGeometry()
            const mergedPositions = []
            const mergedNormals = []

            geometries.forEach(geo => {
              const positions = geo.attributes.position.array
              const normals = geo.attributes.normal?.array

              for (let i = 0; i < positions.length; i++) {
                mergedPositions.push(positions[i])
                if (normals) mergedNormals.push(normals[i])
              }
            })

            mergedGeometry.setAttribute('position', new THREE.Float32BufferAttribute(mergedPositions, 3))
            if (mergedNormals.length > 0) {
              mergedGeometry.setAttribute('normal', new THREE.Float32BufferAttribute(mergedNormals, 3))
            }
            return mergedGeometry
          }
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

            transformedPoints.forEach((p, i) => {
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

                transformedHolePoints.forEach((p, i) => {
                  if (i === 0) holeShape.moveTo(p.x, p.y)
                  else holeShape.lineTo(p.x, p.y)
                })
                holeShape.closePath()
                fillShape.holes.push(holeShape)
              })
            }

            if (svgRenderMode === 'outline') {
              // Create outline by extruding the shape
              const extrudeSettings = {
                depth: edgeThickness,
                bevelEnabled: false
              }
              geometries.push(new THREE.ExtrudeGeometry(fillShape, extrudeSettings))
            } else {
              // Simple flat fill
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

    const outerShape = new THREE.Shape()
    const innerShape = new THREE.Shape()

    switch (shapeType) {
      case 'hexagon': {
        // Outer hexagon
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
          const x = Math.cos(angle) * outerRadius
          const y = Math.sin(angle) * outerRadius
          if (i === 0) outerShape.moveTo(x, y)
          else outerShape.lineTo(x, y)
        }
        outerShape.closePath()

        // Inner hexagon (hole)
        for (let i = 0; i < 6; i++) {
          const angle = (i * Math.PI * 2) / 6 - Math.PI / 2
          const x = Math.cos(angle) * innerRadius
          const y = Math.sin(angle) * innerRadius
          if (i === 0) innerShape.moveTo(x, y)
          else innerShape.lineTo(x, y)
        }
        innerShape.closePath()
        break
      }

      case 'circle': {
        // Outer circle
        outerShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
        // Inner circle (hole)
        innerShape.absarc(0, 0, innerRadius, 0, Math.PI * 2, false)
        break
      }

      case 'star': {
        const outerStarRadius = outerRadius
        const innerStarRadius = 2
        const outerStarRadiusInner = innerRadius
        const innerStarRadiusInner = 2 - edgeThickness / 2

        // Outer star
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? outerStarRadius : innerStarRadius
          const angle = (i * Math.PI) / 5 - Math.PI / 2
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          if (i === 0) outerShape.moveTo(x, y)
          else outerShape.lineTo(x, y)
        }
        outerShape.closePath()

        // Inner star (hole)
        for (let i = 0; i < 10; i++) {
          const radius = i % 2 === 0 ? outerStarRadiusInner : Math.max(innerStarRadiusInner, 0.1)
          const angle = (i * Math.PI) / 5 - Math.PI / 2
          const x = Math.cos(angle) * radius
          const y = Math.sin(angle) * radius
          if (i === 0) innerShape.moveTo(x, y)
          else innerShape.lineTo(x, y)
        }
        innerShape.closePath()
        break
      }

      default:
        // Default circle
        outerShape.absarc(0, 0, outerRadius, 0, Math.PI * 2, false)
        innerShape.absarc(0, 0, innerRadius, 0, Math.PI * 2, false)
    }

    // Add inner shape as a hole in the outer shape
    outerShape.holes.push(innerShape)

    // Create flat geometry with the stroke outline
    return new THREE.ShapeGeometry(outerShape)
  }, [shapeType, customSvgPath, svgRenderMode, edgeThickness])

  return (
    <group position={position} rotation={[0, 0, rotation]} scale={scale}>
      <mesh geometry={outlineGeometry}>
        <meshBasicMaterial color={color} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}
