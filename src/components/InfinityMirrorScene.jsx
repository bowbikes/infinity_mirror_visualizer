import { useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import InfinityMirrorBox from './InfinityMirrorBox'

/**
 * InfinityMirrorScene - Main 3D scene containing the mirror, wall, lighting, and camera
 *
 * Camera setup:
 * - Positioned ~1m from the mirror (100cm = 10 units at 1:10mm scale)
 * - Eye level, facing the mirror
 * - OrbitControls with constraints to prevent going behind the wall
 */
export default function InfinityMirrorScene({
  shapeType = 'hexagon',
  customSvgPath,
  svgRenderMode,
  wallColor,
  frameColor,
  lightColor,
  mirrorSpacingMm,
  frameWidthMm,
  frameHeightMm,
  iconScale,
  iconRotation,
  iconPosition,
  reflectionDepth,
  autoOrbit,
  edgeThickness
}) {
  const orbitControlsRef = useRef()
  const orbitTimeRef = useRef(0)

  // Calculate wall dimensions based on frame size
  const frameWidthUnits = frameWidthMm / 10
  const frameHeightUnits = frameHeightMm / 10
  const wallPadding = 25 // units of padding around the frame
  const wallSegmentSize = 70 // size of wall segments beyond the frame

  // Auto-orbit effect - smooth rotation around Z axis
  useFrame((state, delta) => {
    if (autoOrbit && orbitControlsRef.current) {
      // Complete one full rotation in 10 seconds
      const rotationSpeed = (Math.PI * 2) / 10
      orbitTimeRef.current += delta * rotationSpeed

      const radius = 80 // distance from target

      // 60 degrees from the wall (Z=0 plane)
      const angleFromWall = (65 * Math.PI) / 180

      // Rotation angle around Z axis (clockwise when viewed from front)
      const rotationAngle = orbitTimeRef.current

      // Orbit around Z axis - camera moves in X-Y plane, maintaining distance from Z=0
      const x = radius * Math.cos(angleFromWall) * Math.cos(rotationAngle)
      const y = radius * Math.cos(angleFromWall) * Math.sin(rotationAngle)
      const z = radius * Math.sin(angleFromWall)

      // Update camera position
      state.camera.position.set(x, y, z)
      state.camera.lookAt(0, 0, 0)
    } else {
      // Reset time when disabled
      orbitTimeRef.current = 0
    }
  })

  return (
    <>
      {/* Camera setup - zoomed out to see full mirror */}
      <OrbitControls
        ref={orbitControlsRef}
        makeDefault
        target={[0, 0, 0]}
        minPolarAngle={Math.PI / 4} // 45 degrees
        maxPolarAngle={Math.PI / 1.5} // 120 degrees
        minAzimuthAngle={-Math.PI / 3} // -60 degrees
        maxAzimuthAngle={Math.PI / 3} // 60 degrees
        minDistance={30}
        maxDistance={180}
        enablePan={false}
        enableRotate={!autoOrbit}
      />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} />
      <directionalLight position={[-5, 5, 5]} intensity={0.6} />

      {/* Wall behind the mirror - 4 rectangles around the frame opening */}
      {/* Calculate total wall dimensions */}
      {/* Top section - positioned above the frame */}
      <mesh position={[0, frameHeightUnits / 2 + wallSegmentSize / 2, 0]}>
        <planeGeometry args={[frameWidthUnits + wallSegmentSize * 2, wallSegmentSize]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Bottom section - positioned below the frame */}
      <mesh position={[0, -(frameHeightUnits / 2 + wallSegmentSize / 2), 0]}>
        <planeGeometry args={[frameWidthUnits + wallSegmentSize * 2, wallSegmentSize]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Left section - only covers the height of the frame (no overlap with top/bottom) */}
      <mesh position={[-(frameWidthUnits / 2 + wallSegmentSize / 2), 0, 0]}>
        <planeGeometry args={[wallSegmentSize, frameHeightUnits]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Right section - only covers the height of the frame (no overlap with top/bottom) */}
      <mesh position={[frameWidthUnits / 2 + wallSegmentSize / 2, 0, 0]}>
        <planeGeometry args={[wallSegmentSize, frameHeightUnits]} />
        <meshStandardMaterial
          color={wallColor}
          roughness={0.9}
          metalness={0.1}
        />
      </mesh>

      {/* Infinity Mirror Box */}
      <InfinityMirrorBox
        shapeType={shapeType}
        customSvgPath={customSvgPath}
        svgRenderMode={svgRenderMode}
        lightColor={lightColor}
        frameColor={frameColor}
        mirrorSpacingMm={mirrorSpacingMm}
        frameWidthMm={frameWidthMm}
        frameHeightMm={frameHeightMm}
        iconScale={iconScale}
        iconRotation={iconRotation}
        iconPosition={iconPosition}
        reflectionDepth={reflectionDepth}
        edgeThickness={edgeThickness}
      />
    </>
  )
}
