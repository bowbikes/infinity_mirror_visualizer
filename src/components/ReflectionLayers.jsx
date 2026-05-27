import { useMemo } from 'react'
import * as THREE from 'three'
import SvgIcon from './SvgIcon'

/**
 * ReflectionLayers - Stacks N SvgIcon copies at decreasing brightness +
 * saturation to fake the infinity-mirror recursive-reflection look.
 *
 * Layer i sits at zOffset = -i * spacing, dimmed by 0.75^i and slightly
 * desaturated. The first layer (i=0) is the only emissive one — emissive
 * intensity is gated by layerIndex inside SvgIcon.
 */
// Pre-allocated scratch so we don't churn THREE.Color instances on each
// memo recomputation. Only the memo touches these, single-render-thread.
const _scratchColor = new THREE.Color()
const _scratchHsl = { h: 0, s: 0, l: 0 }

export default function ReflectionLayers({
  shapeType = 'hexagon',
  customSvgPath,
  svgRenderMode,
  color,
  scale,
  rotation,
  position,
  depth = 7,
  spacing = 1, // layer spacing in units (1 unit = 10mm)
  edgeThickness = 0.2,
  frameBounds = null // [width, height] of frame opening; clips first layer
}) {
  // Position arrives as a fresh array literal from the parent on every
  // render; destructure into scalars so the memo deps are stable.
  const [px, py, pz] = position

  const layers = useMemo(() => {
    // Resolve the base color once. The HSL components don't change between
    // layers — only the lightness and saturation scalars do.
    _scratchColor.set(color).getHSL(_scratchHsl)
    const baseH = _scratchHsl.h
    const baseS = _scratchHsl.s
    const baseL = _scratchHsl.l

    const out = new Array(depth)
    for (let i = 0; i < depth; i++) {
      const dimFactor = Math.pow(0.75, i)
      const saturationFactor = Math.pow(0.9, i)
      _scratchColor.setHSL(baseH, baseS * saturationFactor, baseL * dimFactor)
      const layerScale = scale * (1 - i * 0.02) // slight perspective scaling
      // Only layer 0 gets frame clipping. Bake the array into the memo so
      // downstream `frameBounds` deps see a stable reference.
      const localFrameBounds =
        i === 0 && frameBounds
          ? [frameBounds[0] / layerScale, frameBounds[1] / layerScale]
          : null
      out[i] = {
        key: i,
        position: [px, py, pz - i * spacing],
        color: '#' + _scratchColor.getHexString(),
        scale: layerScale,
        layerIndex: i,
        localFrameBounds,
      }
    }
    return out
  }, [depth, color, scale, px, py, pz, spacing, frameBounds])

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
            edgeThickness={edgeThickness}
            layerIndex={layer.layerIndex}
            frameBounds={layer.localFrameBounds}
          />
        </group>
      ))}
    </group>
  )
}
