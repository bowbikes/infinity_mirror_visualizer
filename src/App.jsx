import { useState, useEffect, useRef } from 'react'
import { Canvas } from '@react-three/fiber'
import { EffectComposer, Bloom } from '@react-three/postprocessing'
import InfinityMirrorScene from './components/InfinityMirrorScene'
import ControlsPanel from './components/ControlsPanel'
import CustomArtModal from './components/CustomArtModal'
import ExportModal from './components/ExportModal'
import './components/ControlsLayout.css'
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

// Hash-encoded config keys, in order. Adding a new field to share via URL?
// Append it here and add the corresponding setter to applyHashConfig. The
// custom-art SVG is intentionally NOT shareable — it can be megabytes and
// the user re-uploads it per session.
const SHARED_KEYS = [
  'selectedPreset',
  'wallColor',
  'frameColor',
  'lightColor',
  'frameWidth',
  'frameHeight',
  'units',
  'frameDepthMm',
  'iconScale',
  'iconRotation',
  'iconPositionX',
  'iconPositionY',
  'edgeThickness',
  'reflectionDepth',
  'autoOrbit',
  'enableBloom',
]
const HASH_PREFIX = '#cfg='

function encodeConfig(state) {
  const subset = {}
  for (const k of SHARED_KEYS) subset[k] = state[k]
  // btoa is fine for our ASCII JSON — no Unicode in any of these values.
  return btoa(JSON.stringify(subset))
}
function decodeConfigFromHash() {
  if (typeof window === 'undefined') return null
  const h = window.location.hash
  if (!h.startsWith(HASH_PREFIX)) return null
  try {
    return JSON.parse(atob(h.slice(HASH_PREFIX.length)))
  } catch {
    return null
  }
}

// Single source of truth for every starting value. Used both for useState
// init and for the "Reset all" button. Adding a new control? Add its
// default here and the reset path picks it up for free.
const DEFAULTS = {
  selectedPreset: 'hexagon',
  shapeType: 'hexagon',
  wallColor: '#fffceb',
  frameColor: '#424243',
  lightColor: '#00ffff',
  frameWidth: 300, // mm
  frameHeight: 300, // mm
  units: 'mm',
  frameDepthMm: 30,
  iconScale: 1.0,
  iconRotation: 0,
  iconPositionX: 0,
  iconPositionY: 0,
  edgeThickness: 0.2,
  reflectionDepth: 7,
  autoOrbit: false,
  enableBloom: false,
}

function App() {
  // Read once from the hash at mount time. If we deferred this to a
  // useEffect, the encode-on-change effect would fire first with the
  // still-default state and clobber the hash before the restored state
  // had time to propagate.
  const _initial = (() => {
    const cfg = decodeConfigFromHash()
    return (key) => (cfg && cfg[key] != null ? cfg[key] : DEFAULTS[key])
  })()

  // Icon selection
  const [selectedPreset, setSelectedPreset] = useState(_initial('selectedPreset'))
  const [shapeType, setShapeType] = useState(
    _initial('selectedPreset') === 'custom' ? DEFAULTS.shapeType : _initial('selectedPreset')
  )
  const [customSvgPath, setCustomSvgPath] = useState(null)
  const [customArtFileName, setCustomArtFileName] = useState(null)

  // Mobile drawer state. Above the CSS breakpoint (900px) the panel is
  // pinned and this flag is ignored. Below it, .controls-aside.open
  // slides the drawer in.
  const [drawerOpen, setDrawerOpen] = useState(false)

  // Custom Art modal: holds the entire upload + manufacturability flow.
  // Stays mounted after first open so PreprocessPanel state (uploaded
  // file, slider positions, picked colors) survives close+reopen — the
  // Edit button picks up where the user left off.
  const [isCustomArtModalOpen, setIsCustomArtModalOpen] = useState(false)
  const handleOpenCustomArt = () => setIsCustomArtModalOpen(true)
  const handleCloseCustomArt = () => setIsCustomArtModalOpen(false)

  // Apply a serialized config (from a saved preset, the URL hash, or
  // any future source). Mirrors the lazy useState initializer above but
  // imperatively — we set every field that's present in the incoming
  // cfg so partial blobs still apply cleanly.
  const handleApplyConfig = (cfg) => {
    if (!cfg) return
    if (cfg.selectedPreset != null) {
      setSelectedPreset(cfg.selectedPreset)
      if (cfg.selectedPreset !== 'custom') setShapeType(cfg.selectedPreset)
    }
    if (cfg.wallColor != null) setWallColor(cfg.wallColor)
    if (cfg.frameColor != null) setFrameColor(cfg.frameColor)
    if (cfg.lightColor != null) setLightColor(cfg.lightColor)
    if (cfg.frameWidth != null) setFrameWidth(cfg.frameWidth)
    if (cfg.frameHeight != null) setFrameHeight(cfg.frameHeight)
    if (cfg.units != null) setUnits(cfg.units)
    if (cfg.frameDepthMm != null) setFrameDepthMm(cfg.frameDepthMm)
    if (cfg.iconScale != null) setIconScale(cfg.iconScale)
    if (cfg.iconRotation != null) setIconRotation(cfg.iconRotation)
    if (cfg.iconPositionX != null) setIconPositionX(cfg.iconPositionX)
    if (cfg.iconPositionY != null) setIconPositionY(cfg.iconPositionY)
    if (cfg.edgeThickness != null) setEdgeThickness(cfg.edgeThickness)
    if (cfg.reflectionDepth != null) setReflectionDepth(cfg.reflectionDepth)
    if (cfg.autoOrbit != null) setAutoOrbit(cfg.autoOrbit)
    if (cfg.enableBloom != null) setEnableBloom(cfg.enableBloom)
  }

  // Pure snapshot of the shareable/save-able config subset. The same
  // shape that the URL hash encodes. PresetsSection captures this
  // verbatim on Save.
  const buildCurrentConfig = () => ({
    selectedPreset,
    wallColor,
    frameColor,
    lightColor,
    frameWidth,
    frameHeight,
    units,
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

  // Colors
  const [wallColor, setWallColor] = useState(_initial('wallColor'))
  const [frameColor, setFrameColor] = useState(_initial('frameColor'))
  const [lightColor, setLightColor] = useState(_initial('lightColor'))

  // Frame dimensions
  const [frameWidth, setFrameWidth] = useState(_initial('frameWidth'))
  const [frameHeight, setFrameHeight] = useState(_initial('frameHeight'))
  const [units, setUnits] = useState(_initial('units'))

  // Frame depth (slider value matches what the user reads in the label).
  // Internally the box decomposes this into mirror spacing + 10mm of frame
  // thickness when building geometry.
  const [frameDepthMm, setFrameDepthMm] = useState(_initial('frameDepthMm'))

  // Icon transform
  const [iconScale, setIconScale] = useState(_initial('iconScale'))
  const [iconRotation, setIconRotation] = useState(_initial('iconRotation'))
  const [iconPositionX, setIconPositionX] = useState(_initial('iconPositionX'))
  const [iconPositionY, setIconPositionY] = useState(_initial('iconPositionY'))
  const [edgeThickness, setEdgeThickness] = useState(_initial('edgeThickness'))

  // Reflection depth
  const [reflectionDepth, setReflectionDepth] = useState(_initial('reflectionDepth'))

  // Camera
  const [autoOrbit, setAutoOrbit] = useState(_initial('autoOrbit'))

  // Reset every control back to its DEFAULTS value. Deliberately leaves
  // customSvgPath alone — losing a hard-won upload to an accidental click
  // would be worse than the inconsistency.
  const handleResetAll = () => {
    setWallColor(DEFAULTS.wallColor)
    setFrameColor(DEFAULTS.frameColor)
    setLightColor(DEFAULTS.lightColor)
    setFrameWidth(DEFAULTS.frameWidth)
    setFrameHeight(DEFAULTS.frameHeight)
    setUnits(DEFAULTS.units)
    setFrameDepthMm(DEFAULTS.frameDepthMm)
    setIconScale(DEFAULTS.iconScale)
    setIconRotation(DEFAULTS.iconRotation)
    setIconPositionX(DEFAULTS.iconPositionX)
    setIconPositionY(DEFAULTS.iconPositionY)
    setEdgeThickness(DEFAULTS.edgeThickness)
    setReflectionDepth(DEFAULTS.reflectionDepth)
    setAutoOrbit(DEFAULTS.autoOrbit)
  }

  // Performance settings
  const [enableBloom, setEnableBloom] = useState(
    _initial('enableBloom') ?? false
  )

  // Mirror state into the URL hash via replaceState so each tweak is
  // bookmarkable but doesn't pollute Back-button history.
  useEffect(() => {
    const encoded = encodeConfig({
      selectedPreset,
      wallColor,
      frameColor,
      lightColor,
      frameWidth,
      frameHeight,
      units,
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
    const newHash = `${HASH_PREFIX}${encoded}`
    if (window.location.hash !== newHash) {
      window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}${newHash}`)
    }
  }, [
    selectedPreset,
    wallColor,
    frameColor,
    lightColor,
    frameWidth,
    frameHeight,
    units,
    frameDepthMm,
    iconScale,
    iconRotation,
    iconPositionX,
    iconPositionY,
    edgeThickness,
    reflectionDepth,
    autoOrbit,
    enableBloom,
  ])

  const handleCopyShareLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href)
      return true
    } catch {
      return false
    }
  }

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
    } else if (!customSvgPath) {
      // First time picking Custom Upload — open the wizard immediately
      // so the user isn't staring at an "Upload" button wondering what
      // to do. If they already have art uploaded, leave the modal closed
      // and let them open it via the Edit button.
      handleOpenCustomArt()
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
          // Pause continuous rendering while the Custom Art modal is
          // open. Three.js was eating enough main-thread time that the
          // OS file picker would lag noticeably after clicking Choose
          // file — freezing the scene during upload lets the dialog
          // open instantly. Scene resumes on modal close.
          frameloop={isCustomArtModalOpen ? 'never' : 'always'}
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
      </div>

      {/* Mobile drawer toggle — only visible at narrow widths via CSS. */}
      <button
        type="button"
        className="drawer-toggle"
        onClick={() => setDrawerOpen((v) => !v)}
        aria-label={drawerOpen ? 'Close controls drawer' : 'Open controls drawer'}
        aria-expanded={drawerOpen}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          {drawerOpen ? (
            <>
              <line x1="6" y1="6" x2="18" y2="18" />
              <line x1="6" y1="18" x2="18" y2="6" />
            </>
          ) : (
            <>
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </>
          )}
        </svg>
      </button>

      {/* Scrim — only visible at narrow widths when drawer is open. */}
      <div
        className={`drawer-scrim ${drawerOpen ? 'open' : ''}`}
        onClick={() => setDrawerOpen(false)}
      />

      {/* Controls Panel — when preset is Custom Upload the panel shows
          a compact summary card (thumbnail + Edit button); the actual
          upload flow lives in CustomArtModal so the sidebar stays
          uncluttered. The .controls-aside wrapper handles the
          responsive positioning. */}
      <aside className={`controls-aside ${drawerOpen ? 'open' : ''}`}>
      <ControlsPanel
        customSvgPath={customSvgPath}
        customArtFileName={customArtFileName}
        onOpenCustomArt={handleOpenCustomArt}
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
        enableBloom={enableBloom}
        onEnableBloomChange={setEnableBloom}
        onExportClick={handleExportClick}
        defaults={DEFAULTS}
        onResetAll={handleResetAll}
        onCopyShareLink={handleCopyShareLink}
        currentConfig={buildCurrentConfig()}
        onApplyConfig={handleApplyConfig}
      />
      </aside>

      {/* Custom Art Modal — wraps the upload + preprocessing flow. */}
      <CustomArtModal
        isOpen={isCustomArtModalOpen}
        onClose={handleCloseCustomArt}
        onPreprocessed={handlePreprocessed}
        onFileNameChange={setCustomArtFileName}
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
  }
}

export default App
