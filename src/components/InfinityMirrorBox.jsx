import * as THREE from 'three'
import { useRef } from 'react'
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
  svgRenderMode,
  lightColor,
  frameColor,
  mirrorSpacingMm,
  iconScale,
  iconRotation,
  iconPosition,
  reflectionDepth,
  edgeThickness
}) {
  const boxRef = useRef()

  // Dimensions in units (1 unit = 10mm)
  const width = 30 // 300mm
  const height = 30 // 300mm

  // Convert mirror spacing from mm to units
  const spacing = mirrorSpacingMm / 10 // e.g., 20mm -> 2 units

  // Box depth = spacing + frame thickness
  const frameThickness = 0.5 // 5mm
  const totalDepth = spacing + frameThickness * 2

  // Inner mirror position (back of the box)
  const innerMirrorZ = -totalDepth / 2 + frameThickness

  // Front mirror position
  const frontMirrorZ = innerMirrorZ + spacing

  // Calculate taper angle for clipping planes
  // Reflections scale by (1 - i * 0.02) per layer, with layerSpacing = spacing * 2
  // Scale reduction per unit depth = 0.02 / (spacing * 2)
  // Taper angle in radians
  const scaleReductionPerLayer = 0.02
  const layerSpacing = spacing * 2
  const scaleReductionPerUnitDepth = scaleReductionPerLayer / layerSpacing
  const taperAngle = Math.atan(scaleReductionPerUnitDepth)

  // Multiplier to fine-tune the taper angle
  const taperMultiple = 12.5

  return (
    <group ref={boxRef}>
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

      {/* Back panel - REMOVED to allow infinite depth */}
      {/* No back wall - the frame is now a portal into infinite space */}

      {/* Inner cavity - REMOVED to create infinite depth illusion */}
      {/* The black void is now open so you can see through to all reflection layers */}

      {/* Icon and reflection layers - ENABLED with non-emissive materials */}
      <ReflectionLayers
        shapeType={shapeType}
        customSvgPath={customSvgPath}
        svgRenderMode={svgRenderMode}
        color={lightColor}
        scale={iconScale * 1.5}
        rotation={iconRotation}
        position={[
          iconPosition[0] * 5,
          iconPosition[1] * 5,
          innerMirrorZ + 0.1
        ]}
        depth={reflectionDepth}
        spacing={spacing}
        mirrorSpacingMm={mirrorSpacingMm}
        edgeThickness={edgeThickness}
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
      <group position={[0, height / 2 - 1, totalDepth + 0.1]} rotation={[-taperMultiple*taperAngle, 0, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[width, 1, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Bottom clipping plane - rotated inward around X axis from front edge */}
      <group position={[0, -height / 2 + 1, totalDepth + 0.1]} rotation={[taperMultiple*taperAngle, 0, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[width, 1, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Left clipping plane - rotated inward around Y axis from front edge */}
      <group position={[-width / 2 + 1, 0, totalDepth + 0.1]} rotation={[0, -taperMultiple*taperAngle, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[1, height - 2, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>

      {/* Right clipping plane - rotated inward around Y axis from front edge */}
      <group position={[width / 2 - 1, 0, totalDepth + 0.1]} rotation={[0, taperMultiple*taperAngle, 0]}>
        <mesh position={[0, 0, -50 - (totalDepth + 0.1)]}>
          <boxGeometry args={[1, height - 2, 100]} />
          <meshBasicMaterial color="#000000" side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  )
}
