import { useMemo } from 'react'
import * as THREE from 'three'
import SvgIcon from './SvgIcon'

/**
 * ReflectionLayers - Creates stacked layers to simulate infinity mirror effect
 *
 * Instead of true recursive reflection, we create N layers where each is:
 * - Positioned progressively deeper (negative Z)
 * - Dimmer and less saturated
 * - Slightly smaller (optional perspective effect)
 *
 * Performance: Reuses geometry and materials efficiently
 */
export default function ReflectionLayers({
  shapeType = 'hexagon',
  customSvgPath,
  svgRenderMode,
  color,
  scale,
  rotation,
  position,
  depth = 7,
  spacing = 2, // mirror spacing in units (1 unit = 10mm, so 2 units = 20mm)
  mirrorSpacingMm = 20,
  edgeThickness = 0.2
}) {
  // Calculate layer spacing based on mirror spacing
  // Each reflection appears to be twice as far back
  // Increased spacing for better visibility
  const layerSpacing = spacing * 2

  const layers = useMemo(() => {
    const layerArray = []

    for (let i = 0; i < depth; i++) {
      // Each layer gets progressively:
      // - Further back in Z
      // - Dimmer (opacity/intensity)
      // - Less saturated
      const zOffset = -i * layerSpacing
      const dimFactor = Math.pow(0.75, i) // Exponential dimming (less aggressive)
      const saturationFactor = Math.pow(0.9, i) // Less desaturation

      // Convert hex color to RGB, reduce saturation
      const c = new THREE.Color(color)
      const hsl = {}
      c.getHSL(hsl)
      // Keep saturation high, only adjust lightness
      c.setHSL(hsl.h, hsl.s * saturationFactor, hsl.l * dimFactor)

      layerArray.push({
        key: i,
        position: [position[0], position[1], position[2] + zOffset],
        color: '#' + c.getHexString(),
        opacity: dimFactor,
        scale: scale * (1 - i * 0.02), // Slight perspective scaling
        layerIndex: i // Pass layer index to control emissive intensity
      })
    }

    return layerArray
  }, [depth, color, scale, position, spacing, layerSpacing])

  return (
    <group>
      {layers.map((layer) => (
        <group key={layer.key} position={layer.position}>
          <SvgIcon
            shapeType={shapeType}
            customSvgPath={customSvgPath}
            svgRenderMode={svgRenderMode}
            color={layer.color}
            scale={layer.scale}
            rotation={rotation}
            position={[0, 0, 0]}
            edgeThickness={edgeThickness}
            layerIndex={layer.layerIndex}
          />
          {/* Glow plane removed temporarily for debugging */}
        </group>
      ))}
    </group>
  )
}
