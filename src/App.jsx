import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import InfinityMirrorScene from './components/InfinityMirrorScene'
import ControlsPanel from './components/ControlsPanel'
import PreprocessPanel from './components/PreprocessPanel'
import ExportModal from './components/ExportModal'
import {
  serializeConfiguration,
  captureCanvasSnapshot,
  createExportZip,
  downloadZipFile,
  sendToManufacturer
} from './utils/exportUtils'

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

  // Colors
  const [wallColor, setWallColor] = useState('#fffceb')
  const [frameColor, setFrameColor] = useState('#424243')
  const [lightColor, setLightColor] = useState('#00ffff')

  // Frame dimensions
  const [frameWidth, setFrameWidth] = useState(300) // mm
  const [frameHeight, setFrameHeight] = useState(300) // mm
  const [units, setUnits] = useState('mm') // 'mm' or 'in'

  // Frame depth (slider value matches what the user reads in the label).
  // Internally the box decomposes this into mirror spacing + 10mm of frame
  // thickness when building geometry.
  const [frameDepthMm, setFrameDepthMm] = useState(30) // mm

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

  // Export modal
  const [isExportModalOpen, setIsExportModalOpen] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const canvasRef = useRef(null)

  // Receive the preprocessed manufacturable black SVG from PreprocessPanel.
  // Flips to 'custom' shape so the 3D scene picks it up.
  const handlePreprocessed = (manufacturableSvg) => {
    setCustomSvgPath(manufacturableSvg)
    setShapeType('custom')
    setSelectedPreset('custom')
  }

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

  // Export handlers
  const handleExportClick = () => {
    setIsExportModalOpen(true)
  }

  const handleExportDownload = async (customerInfo) => {
    setIsExporting(true)
    try {
      // Serialize the current configuration
      const config = serializeConfiguration({
        selectedPreset,
        shapeType,
        customSvgPath,
        wallColor,
        frameColor,
        lightColor,
        frameDepthMm,
        iconScale,
        iconRotation,
        iconPositionX,
        iconPositionY,
        edgeThickness,
        reflectionDepth,
        autoOrbit,
        enableBloom,
      })

      // Capture canvas snapshot
      const canvas = canvasRef.current?.querySelector('canvas')
      const snapshot = await captureCanvasSnapshot(canvas)

      // Create ZIP file
      const zipBlob = await createExportZip(config, snapshot, customerInfo, customSvgPath)

      // Download the file
      const filename = `infinity-mirror-${customerInfo.name?.replace(/\s+/g, '-') || 'config'}-${Date.now()}.zip`
      downloadZipFile(zipBlob, filename)

      // Close modal
      setIsExportModalOpen(false)
      alert('Export successful! Your configuration has been downloaded.')
    } catch (error) {
      console.error('Export error:', error)
      alert('Export failed: ' + error.message)
    } finally {
      setIsExporting(false)
    }
  }

  const handleSendToManufacturer = async (customerInfo) => {
    setIsExporting(true)
    try {
      // Serialize the current configuration
      const config = serializeConfiguration({
        selectedPreset,
        shapeType,
        customSvgPath,
        wallColor,
        frameColor,
        lightColor,
        frameDepthMm,
        iconScale,
        iconRotation,
        iconPositionX,
        iconPositionY,
        edgeThickness,
        reflectionDepth,
        autoOrbit,
        enableBloom,
      })

      // Capture canvas snapshot
      const canvas = canvasRef.current?.querySelector('canvas')
      const snapshot = await captureCanvasSnapshot(canvas)

      // Create ZIP file
      const zipBlob = await createExportZip(config, snapshot, customerInfo, customSvgPath)

      // Manufacturer endpoint comes from build-time env (VITE_MANUFACTURER_ENDPOINT).
      // When not set, the Send-to-Manufacturer button is hidden in ExportModal —
      // this branch only runs if the env was present at build time.
      const manufacturerEndpoint = import.meta.env.VITE_MANUFACTURER_ENDPOINT
      if (!manufacturerEndpoint) {
        throw new Error('Manufacturer endpoint not configured for this build.')
      }
      const result = await sendToManufacturer(zipBlob, customerInfo, manufacturerEndpoint)

      if (result.success) {
        setIsExportModalOpen(false)
        alert('Successfully sent to manufacturer! You will receive a confirmation email shortly.')
      } else {
        throw new Error(result.error || 'Failed to send to manufacturer')
      }
    } catch (error) {
      console.error('Send error:', error)
      alert('Failed to send to manufacturer: ' + error.message + '\n\nPlease download the file and send it manually.')
    } finally {
      setIsExporting(false)
    }
  }

  // Convert rotation from degrees to radians for Three.js
  const iconRotationRad = (iconRotation * Math.PI) / 180

  return (
    <div style={styles.container}>
      {/* 3D Canvas */}
      <div style={styles.canvasContainer} ref={canvasRef}>
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
            wallColor={wallColor}
            frameColor={frameColor}
            lightColor={lightColor}
            frameDepthMm={frameDepthMm}
            frameWidthMm={frameWidth}
            frameHeightMm={frameHeight}
            iconScale={iconScale}
            iconRotation={iconRotationRad}
            iconPosition={[iconPositionX, iconPositionY, 0]}
            reflectionDepth={reflectionDepth}
            autoOrbit={autoOrbit}
            edgeThickness={edgeThickness}
          />

          {/* Optional bloom effect for neon glow */}
          {enableBloom && (
            <EffectComposer multisampling={8}>
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

      {/* Controls Panel — preprocessing section injected at the top */}
      <ControlsPanel
        topSection={
          <PreprocessPanel onPreprocessed={handlePreprocessed} />
        }
        selectedPreset={selectedPreset}
        onPresetChange={handlePresetChange}
        wallColor={wallColor}
        onWallColorChange={setWallColor}
        frameColor={frameColor}
        onFrameColorChange={setFrameColor}
        lightColor={lightColor}
        onLightColorChange={setLightColor}
        frameWidth={frameWidth}
        onFrameWidthChange={setFrameWidth}
        frameHeight={frameHeight}
        onFrameHeightChange={setFrameHeight}
        units={units}
        onUnitsChange={setUnits}
        frameDepthMm={frameDepthMm}
        onFrameDepthChange={setFrameDepthMm}
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
        onExportClick={handleExportClick}
      />

      {/* Export Modal */}
      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        onExport={handleExportDownload}
        onSendToManufacturer={handleSendToManufacturer}
        canSendToManufacturer={Boolean(import.meta.env.VITE_MANUFACTURER_ENDPOINT)}
        isProcessing={isExporting}
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
