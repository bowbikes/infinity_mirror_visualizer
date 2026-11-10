import { useEffect, useRef } from 'react'
import { OrbitControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import InfinityMirrorBox from './InfinityMirrorBox'
import Wall from './Wall'
import RoomDecor from './RoomDecor'

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
  wallColor,
  frameColor,
  lightColor,
  frameDepthMm,
  frameWidthMm,
  frameHeightMm,
  iconScale,
  iconRotation,
  iconPosition,
  reflectionDepth,
  autoOrbit,
  onUserOrbitStart,
  showRoom = true,
  edgeThickness,
  lightIntensity = 1.0,
}) {
  const orbitControlsRef = useRef()
  const orbitTimeRef = useRef(0)
  // The page opens with the camera already orbiting, because a head-on view
  // hides the one thing this tool exists to show: how the reflections recede.
  // The moment the visitor grabs the scene, they get the camera. This ref
  // stops the auto-orbit in the SAME frame as the grab; the state change that
  // follows (autoOrbit -> false) arrives a render later, and without the ref
  // the two would fight over the camera for that frame.
  const userTookOverRef = useRef(false)
  useEffect(() => {
    if (autoOrbit) userTookOverRef.current = false
  }, [autoOrbit])

  // Frame size in scene units (1 unit = 10 mm)
  const frameWidthUnits = frameWidthMm / 10
  const frameHeightUnits = frameHeightMm / 10

  // How far back the camera has to sit for the mirror (and a little of the
  // wall around it) to fit the viewport. The distance used to be fixed, which
  // cut the sides off the mirror on a phone held upright. 50 degree vertical
  // field of view, so half of it is 25.
  const { camera, size } = useThree()
  const aspect = size.width / Math.max(1, size.height)
  const TAN_HALF_FOV = Math.tan((25 * Math.PI) / 180)
  const fitDistance = Math.min(
    170,
    Math.max(
      80,
      (frameWidthUnits / 2 + 8) / (TAN_HALF_FOV * aspect),
      (frameHeightUnits / 2 + 14) / TAN_HALF_FOV
    )
  )
  const fitDistanceRef = useRef(fitDistance)
  fitDistanceRef.current = fitDistance

  // Start head-on at that distance. Only on mount: after that the camera
  // belongs to the auto-orbit or to the visitor.
  useEffect(() => {
    camera.position.set(0, 0, fitDistanceRef.current)
    camera.lookAt(0, 0, 0)
    orbitControlsRef.current?.update?.()
  }, [camera])

  // Auto-orbit, smooth rotation around the Z axis at one full turn / 10s.
  useFrame((state, delta) => {
    if (!autoOrbit || userTookOverRef.current || !orbitControlsRef.current) {
      // Snap the accumulator back to zero exactly once when orbit stops, so
      // the next enable starts from a known phase.
      if (orbitTimeRef.current !== 0) orbitTimeRef.current = 0
      return
    }
    const rotationSpeed = (Math.PI * 2) / 10
    orbitTimeRef.current += delta * rotationSpeed

    const radius = fitDistanceRef.current
    const angleFromWall = (65 * Math.PI) / 180
    const x = radius * Math.cos(angleFromWall) * Math.cos(orbitTimeRef.current)
    const y = radius * Math.cos(angleFromWall) * Math.sin(orbitTimeRef.current)
    const z = radius * Math.sin(angleFromWall)
    state.camera.position.set(x, y, z)
    state.camera.lookAt(0, 0, 0)
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
        // Rotation stays enabled while auto-orbiting, so the first drag
        // works. It used to be disabled, which meant a visitor who dragged a
        // moving scene got nothing and had to find the checkbox first. The
        // auto-orbit path (25 degrees off the mirror's axis) sits inside the
        // polar and azimuth limits above, so the handoff never snaps.
        onStart={() => {
          if (autoOrbit && !userTookOverRef.current) {
            userTookOverRef.current = true
            onUserOrbitStart?.()
          }
        }}
      />

      {/* Lighting */}
      <ambientLight intensity={0.5} />
      <directionalLight position={[5, 5, 5]} intensity={1.0} />
      <directionalLight position={[-5, 5, 5]} intensity={0.6} />

      {/* The wall: one seamless surface with a hole for the mirror, a light
          falloff, and the frame's contact shadow. */}
      <Wall
        frameWidthUnits={frameWidthUnits}
        frameHeightUnits={frameHeightUnits}
        wallColor={wallColor}
      />

      {/* A shelf and two quiet framed pieces, for scale. Tinted from the wall
          colour; switchable from the panel. */}
      {showRoom && (
        <RoomDecor
          frameWidthUnits={frameWidthUnits}
          frameHeightUnits={frameHeightUnits}
          wallColor={wallColor}
        />
      )}

      {/* Infinity Mirror Box */}
      <InfinityMirrorBox
        shapeType={shapeType}
        customSvgPath={customSvgPath}
        lightColor={lightColor}
        frameColor={frameColor}
        frameDepthMm={frameDepthMm}
        frameWidthMm={frameWidthMm}
        frameHeightMm={frameHeightMm}
        iconScale={iconScale}
        iconRotation={iconRotation}
        iconPosition={iconPosition}
        reflectionDepth={reflectionDepth}
        edgeThickness={edgeThickness}
        lightIntensity={lightIntensity}
      />
    </>
  )
}
