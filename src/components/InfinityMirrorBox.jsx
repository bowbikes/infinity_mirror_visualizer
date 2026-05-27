import { useMemo } from 'react'
import * as THREE from 'three'
import ReflectionLayers from './ReflectionLayers'

/**
 * InfinityMirrorBox - The main 3D mirror box geometry
 *
 * Scale: 1 unit = 10mm
 * Default dimensions: 300mm x 300mm = 30 x 30 units
 *
 * Components:
 * - Frame box (outer casing)
 * - Inner mirror (fully reflective, at the back)
 * - Front 2-way mirror (semi-transparent)
 * - Reflection layers (simulated infinity effect)
 */
export default function InfinityMirrorBox({
  shapeType = 'hexagon',
  customSvgPath,
  lightColor,
  frameColor,
  frameDepthMm,
  frameWidthMm = 300,
  frameHeightMm = 300,
  iconScale,
  iconRotation,
  iconPosition,
  reflectionDepth,
  edgeThickness
}) {
  // Dimensions in units (1 unit = 10mm).
  const width = frameWidthMm / 10
  const height = frameHeightMm / 10

  // Frame depth = mirror-to-mirror spacing + 10mm of frame thickness
  // (5mm front + 5mm back). Decompose the user-facing depth back into
  // those two pieces.
  const frameThickness = 0.5 // 5mm in units
  const totalDepth = frameDepthMm / 10
  const spacing = totalDepth - frameThickness * 2

  // Clipping-plane taper: reflections scale by (1 - i * 0.02) per layer at
  // layerSpacing = spacing * 2, so the planes tilt inward at that rate.
  // taperMultiple is hand-tuned to match the visual perspective.
  const taperAngle = Math.atan(0.02 / (spacing * 2))
  const taperMultiple = 32.5

  // Stable frame-bounds array so downstream memos don't see a new reference
  // every render. (Inline `[width-2, height-2]` was breaking SvgIcon's memo.)
  const frameBounds = useMemo(() => [width - 2, height - 2], [width, height])

  return (
    <group>
      {/* Frame border - creates 1 unit border around mirror */}
      {/* Top border */}
      <mesh position={[0, height / 2 - 0.5, totalDepth/2]}>
        <boxGeometry args={[width, 1, totalDepth + 1]} />
        <meshStandardMaterial
          color={frameColor}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Bottom border */}
      <mesh position={[0, -height / 2 + 0.5, totalDepth/2]}>
        <boxGeometry args={[width, 1, totalDepth + 1]} />
        <meshStandardMaterial
          color={frameColor}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Left border */}
      <mesh position={[-width / 2 + 0.5, 0, totalDepth/2]}>
        <boxGeometry args={[1, height - 2, totalDepth + 1]} />
        <meshStandardMaterial
          color={frameColor}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* Right border */}
      <mesh position={[width / 2 - 0.5, 0, totalDepth/2]}>
        <boxGeometry args={[1, height - 2, totalDepth + 1]} />
        <meshStandardMaterial
          color={frameColor}
          metalness={0.3}
          roughness={0.7}
        />
      </mesh>

      {/* No back wall — the frame is a portal into the reflection stack. */}

      {/* Icon and reflection layers — first layer sits in the middle of the frame. */}
      <ReflectionLayers
        shapeType={shapeType}
        customSvgPath={customSvgPath}
        color={lightColor}
        scale={iconScale * 1.5}
        rotation={iconRotation}
        position={[
          iconPosition[0] * 5,
          iconPosition[1] * 5,
          totalDepth / 2
        ]}
        depth={reflectionDepth}
        spacing={spacing}
        edgeThickness={edgeThickness}
        frameBounds={frameBounds}
      />

      {/* Front 2-way mirror (semi-transparent) */}
      <mesh position={[0, 0, totalDepth + 0.1]}>
        <planeGeometry args={[width - 2, height - 2]} />
        <meshStandardMaterial
          color="#ffffff"
          metalness={0.95}
          roughness={0.3}
          transparent
          opacity={0.1}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Glass/acrylic front cover */}
      <mesh position={[0, 0, totalDepth / 2 + 0.1]}>
        <planeGeometry args={[width - 2, height - 2]} />
        <meshStandardMaterial
          color="#ffffff"
          metalness={0.95}
          roughness={0.1}
          transparent
          opacity={0.05}
          side={THREE.DoubleSide}
        />
      </mesh>

      {/* Black clipping planes to mask reflections outside the frame */}
      {/* These extend deep into -Z and are angled inward to match the perspective scaling */}
      {/* Each plane is in a group that rotates around the frame edge (front of box) */}

      {/* Top clipping plane - rotated inward around X axis from front edge */}
      <group position={[0, height / 2 - 0.2 , totalDepth + 0.1]} rotation={[-taperMultiple*taperAngle, 0, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[width, 1, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Bottom clipping plane - rotated inward around X axis from front edge */}
      <group position={[0, -height / 2 + 0.2, totalDepth + 0.1]} rotation={[taperMultiple*taperAngle, 0, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[width, 1, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Left clipping plane - rotated inward around Y axis from front edge */}
      <group position={[-width / 2 + 0.2, 0, totalDepth + 0.1]} rotation={[0, -taperMultiple*taperAngle, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[1, height - 2, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Right clipping plane - rotated inward around Y axis from front edge */}
      <group position={[width / 2 - 0.2, 0, totalDepth + 0.1]} rotation={[0, taperMultiple*taperAngle, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[1, height - 2, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
