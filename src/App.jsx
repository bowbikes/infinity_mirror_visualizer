import { useState, useEffect } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import InfinityMirrorScene from './components/InfinityMirrorScene'
import ControlsPanel from './components/ControlsPanel'

/**
 * Main App Component
 *
 * Manages state for all customization options and renders:
 * - 3D Canvas with the infinity mirror scene
 * - Controls panel for user customization
 *
 * Performance settings:
 * - dpr={[1, 2]} limits pixel ratio for better mobile performance
 * - Bloom effect is optional and tuned for performance
 */

// Shape presets - using built-in Three.js shapes instead of SVG files
const SHAPE_PRESETS = ['hexagon', 'circle', 'star']

function App() {
  // Icon selection
  const [selectedPreset, setSelectedPreset] = useState('hexagon')
  const [shapeType, setShapeType] = useState('hexagon')
  const [customSvgPath, setCustomSvgPath] = useState(null)
  const [svgRenderMode, setSvgRenderMode] = useState('outline') // 'outline' or 'fill'

  // Colors
  const [wallColor, setWallColor] = useState('#fffceb')
  const [frameColor, setFrameColor] = useState('#424243')
  const [lightColor, setLightColor] = useState('#00ffff')

  // Mirror settings
  const [mirrorSpacing, setMirrorSpacing] = useState(20) // mm

  // Icon transform
  const [iconScale, setIconScale] = useState(1.0)
  const [iconRotation, setIconRotation] = useState(0) // degrees
  const [iconPositionX, setIconPositionX] = useState(0)
  const [iconPositionY, setIconPositionY] = useState(0)
  const [edgeThickness, setEdgeThickness] = useState(0.2)

  // Reflection depth
  const [reflectionDepth, setReflectionDepth] = useState(7)

  // Camera
  const [autoOrbit, setAutoOrbit] = useState(false)

  // Performance settings
  const [enableBloom, setEnableBloom] = useState(false)

  // Update shape type when preset changes
  useEffect(() => {
    if (selectedPreset !== 'custom') {
      setShapeType(selectedPreset)
    }
  }, [selectedPreset])

  const handlePresetChange = (preset) => {
    setSelectedPreset(preset)
    if (preset !== 'custom') {
      setShapeType(preset)
    }
  }

  const handleCustomUpload = (svgText) => {
    // Parse SVG - just pass the entire SVG text
    // The SvgIcon component will handle parsing all elements
    const parser = new DOMParser()
    const svgDoc = parser.parseFromString(svgText, 'image/svg+xml')

    // Check for parsing errors
    const parseError = svgDoc.querySelector('parsererror')
    if (parseError) {
      console.error('SVG parsing error:', parseError)
      return
    }

    // Store the entire SVG content
    // SvgIcon will use SVGLoader which handles all SVG elements (path, line, polyline, etc.)
    setCustomSvgPath(svgText)
    setShapeType('custom')
    setSelectedPreset('custom')

    // Default to stroke mode for custom SVGs as it works better for complex line-based geometries
    setSvgRenderMode('stroke')
  }

  // Convert rotation from degrees to radians for Three.js
  const iconRotationRad = (iconRotation * Math.PI) / 180

  return (
    <div style={styles.container}>
      {/* 3D Canvas */}
      <div style={styles.canvasContainer}>
        <Canvas
          camera={{
            position: [0, 0, 60],
            fov: 50
          }}
          dpr={[1, 2]} // Performance: limit pixel ratio
          gl={{
            antialias: true,
            alpha: false,
            powerPreference: 'high-performance'
          }}
        >
          {/* Main scene */}
          <InfinityMirrorScene
            shapeType={shapeType}
            customSvgPath={customSvgPath}
            svgRenderMode={svgRenderMode}
            wallColor={wallColor}
            frameColor={frameColor}
            lightColor={lightColor}
            mirrorSpacingMm={mirrorSpacing}
            iconScale={iconScale}
            iconRotation={iconRotationRad}
            iconPosition={[iconPositionX, iconPositionY, 0]}
            reflectionDepth={reflectionDepth}
            autoOrbit={autoOrbit}
            edgeThickness={edgeThickness}
          />

          {/* Optional bloom effect for neon glow */}
          {enableBloom && (
            <EffectComposer>
              <Bloom
                intensity={1.5}
                luminanceThreshold={0.3}
                luminanceSmoothing={0.9}
                mipmapBlur
              />
            </EffectComposer>
          )}
        </Canvas>

        {/* Performance toggle (bottom right corner) */}
        <div style={styles.performanceToggle}>
          <label style={styles.toggleLabel}>
            <input
              type="checkbox"
              checked={enableBloom}
              onChange={(e) => setEnableBloom(e.target.checked)}
              style={styles.toggleCheckbox}
            />
            Bloom Effect (disable for better performance)
          </label>
        </div>
      </div>

      {/* Controls Panel */}
      <ControlsPanel
        selectedPreset={selectedPreset}
        onPresetChange={handlePresetChange}
        onCustomUpload={handleCustomUpload}
        svgRenderMode={svgRenderMode}
        onSvgRenderModeChange={setSvgRenderMode}
        wallColor={wallColor}
        onWallColorChange={setWallColor}
        frameColor={frameColor}
        onFrameColorChange={setFrameColor}
        lightColor={lightColor}
        onLightColorChange={setLightColor}
        mirrorSpacing={mirrorSpacing}
        onMirrorSpacingChange={setMirrorSpacing}
        iconScale={iconScale}
        onIconScaleChange={setIconScale}
        iconRotation={iconRotation}
        onIconRotationChange={setIconRotation}
        iconPositionX={iconPositionX}
        onIconPositionXChange={setIconPositionX}
        iconPositionY={iconPositionY}
        onIconPositionYChange={setIconPositionY}
        edgeThickness={edgeThickness}
        onEdgeThicknessChange={setEdgeThickness}
        reflectionDepth={reflectionDepth}
        onReflectionDepthChange={setReflectionDepth}
        autoOrbit={autoOrbit}
        onAutoOrbitChange={setAutoOrbit}
      />
    </div>
  )
}

const styles = {
  container: {
    display: 'flex',
    width: '100vw',
    height: '100vh',
    backgroundColor: '#000000',
    overflow: 'hidden'
  },
  canvasContainer: {
    flex: 1,
    position: 'relative',
    minWidth: 0 // Allow flex shrinking
  },
  performanceToggle: {
    position: 'absolute',
    bottom: '16px',
    right: '16px',
    backgroundColor: 'rgba(26, 26, 26, 0.9)',
    padding: '12px 16px',
    borderRadius: '8px',
    backdropFilter: 'blur(10px)'
  },
  toggleLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '12px',
    color: '#ffffff',
    cursor: 'pointer',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  },
  toggleCheckbox: {
    marginRight: '8px',
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  }
}

export default App
