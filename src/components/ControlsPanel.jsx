/**
 * ControlsPanel — visualizer customization controls.
 *
 * Custom art upload + preprocessing live in the `topSection` (PreprocessPanel)
 * injected from App.jsx. This panel only renders the preset picker, colors,
 * frame dimensions, transform, camera, and export controls.
 */
export default function ControlsPanel({
  topSection,
  selectedPreset,
  onPresetChange,
  wallColor,
  onWallColorChange,
  frameColor,
  onFrameColorChange,
  lightColor,
  onLightColorChange,
  frameWidth,
  onFrameWidthChange,
  frameHeight,
  onFrameHeightChange,
  units,
  onUnitsChange,
  frameDepthMm,
  onFrameDepthChange,
  iconScale,
  onIconScaleChange,
  iconRotation,
  onIconRotationChange,
  iconPositionX,
  onIconPositionXChange,
  iconPositionY,
  onIconPositionYChange,
  edgeThickness,
  onEdgeThicknessChange,
  reflectionDepth,
  onReflectionDepthChange,
  autoOrbit,
  onAutoOrbitChange,
  onExportClick,
}) {
  // Pick a readable text color against the export button's background.
  const getContrastColor = (hexColor) => {
    const hex = hexColor.replace('#', '')
    const r = parseInt(hex.substr(0, 2), 16)
    const g = parseInt(hex.substr(2, 2), 16)
    const b = parseInt(hex.substr(4, 2), 16)
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
  }

  return (
    <div style={styles.panel}>
      <h2 style={styles.title}>Infinity Mirror Configurator</h2>

      {topSection}

      {/* Icon Selection */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Icon</h3>
        <div style={styles.control}>
          <label style={styles.label}>Preset:</label>
          <select
            value={selectedPreset}
            onChange={(e) => onPresetChange(e.target.value)}
            style={styles.select}
          >
            <option value="hexagon">Hexagon</option>
            <option value="circle">Circle</option>
            <option value="star">Star</option>
            <option value="custom">Custom Upload</option>
          </select>
        </div>

        {selectedPreset === 'custom' && (
          <div style={styles.note}>
            Upload custom art via the <strong>Custom Art</strong> panel at
            the top. JPGs, PNGs, colored SVGs, and line-art SVGs all flow
            through the manufacturability preprocessor and render as the
            flat fill the laser will cut.
          </div>
        )}
      </div>

      {/* Colors */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Colors</h3>

        <div style={styles.control}>
          <label style={styles.label}>Wall:</label>
          <input
            type="color"
            value={wallColor}
            onChange={(e) => onWallColorChange(e.target.value)}
            style={styles.colorInput}
          />
          <input
            type="text"
            value={wallColor}
            onChange={(e) => onWallColorChange(e.target.value)}
            style={styles.textInput}
            placeholder="#151515"
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Frame:</label>
          <input
            type="color"
            value={frameColor}
            onChange={(e) => onFrameColorChange(e.target.value)}
            style={styles.colorInput}
          />
          <input
            type="text"
            value={frameColor}
            onChange={(e) => onFrameColorChange(e.target.value)}
            style={styles.textInput}
            placeholder="#222222"
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Light:</label>
          <input
            type="color"
            value={lightColor}
            onChange={(e) => onLightColorChange(e.target.value)}
            style={styles.colorInput}
          />
          <input
            type="text"
            value={lightColor}
            onChange={(e) => onLightColorChange(e.target.value)}
            style={styles.textInput}
            placeholder="#00ffff"
          />
        </div>
      </div>

      {/* Frame Controls */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Frame Controls</h3>

        <div style={styles.control}>
          <label style={styles.label}>
            <input
              type="checkbox"
              checked={units === "in"}
              onChange={(e) =>
                onUnitsChange(e.target.checked ? "in" : "mm")
              }
              style={styles.checkbox}
            />
            Use inches
          </label>
        </div>


        <div style={styles.control}>
          <label style={styles.label}>
            Width: {units === 'mm' ? `${frameWidth}mm` : `${(frameWidth / 25.4).toFixed(2)}in`}
          </label>
          <input
            type="range"
            min="100"
            max="600"
            step="10"
            value={frameWidth}
            onChange={(e) => onFrameWidthChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>
            Height: {units === 'mm' ? `${frameHeight}mm` : `${(frameHeight / 25.4).toFixed(2)}in`}
          </label>
          <input
            type="range"
            min="100"
            max="600"
            step="10"
            value={frameHeight}
            onChange={(e) => onFrameHeightChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>
            Frame Depth: {frameDepthMm}mm
          </label>
          <input
            type="range"
            min="21"
            max="130"
            step="2"
            value={frameDepthMm}
            onChange={(e) => onFrameDepthChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Layers: {reflectionDepth}</label>
          <input
            type="range"
            min="4"
            max="20"
            step="1"
            value={reflectionDepth}
            onChange={(e) => onReflectionDepthChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>
      </div>

      {/* SVG Transform */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Icon Transform</h3>

        <div style={styles.control}>
          <label style={styles.label}>Scale: {iconScale.toFixed(2)}</label>
          <input
            type="range"
            min="0.1"
            max="10.0"
            step="0.1"
            value={iconScale}
            onChange={(e) => onIconScaleChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Rotation: {Math.round(iconRotation)}°</label>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={iconRotation}
            onChange={(e) => onIconRotationChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Position X: {iconPositionX.toFixed(1)}</label>
          <input
            type="range"
            min="-1.5"
            max="1.5"
            step="0.1"
            value={iconPositionX}
            onChange={(e) => onIconPositionXChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Position Y: {iconPositionY.toFixed(1)}</label>
          <input
            type="range"
            min="-1.5"
            max="1.5"
            step="0.1"
            value={iconPositionY}
            onChange={(e) => onIconPositionYChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Edge Thickness: {edgeThickness.toFixed(2)}</label>
          <input
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={edgeThickness}
            onChange={(e) => onEdgeThicknessChange(Number(e.target.value))}
            style={styles.slider}
          />
        </div>
      </div>

      {/* Auto-orbit */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Camera</h3>
        <div style={styles.control}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={autoOrbit}
              onChange={(e) => onAutoOrbitChange(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-orbit
          </label>
        </div>
      </div>

      {/* Export Button */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Export</h3>
        <button
          onClick={onExportClick}
          style={{
            ...styles.exportButton,
            backgroundColor: lightColor,
            color: getContrastColor(lightColor)
          }}
        >
          Save & Export Design
        </button>
        <div style={styles.exportNote}>
          <small>
            Export your configuration for manufacturing with tamper protection
          </small>
        </div>
      </div>

      {/* Performance note */}
      <div style={styles.note}>
        <small>
          <strong>Performance tips:</strong> Reduce reflection layers for better mobile performance.
          The visualizer is optimized for mid-range devices.
        </small>
      </div>
    </div>
  )
}

const styles = {
  panel: {
    width: '320px',
    maxHeight: '100vh',
    overflowY: 'auto',
    backgroundColor: '#1a1a1a',
    color: '#ffffff',
    padding: '20px',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    boxSizing: 'border-box'
  },
  title: {
    margin: '0 0 20px 0',
    fontSize: '20px',
    fontWeight: '600'
  },
  section: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333'
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#999'
  },
  control: {
    marginBottom: '12px'
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    color: '#ccc'
  },
  select: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '13px'
  },
  fileInput: {
    width: '100%',
    padding: '8px',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '4px'
  },
  colorInput: {
    width: '50px',
    height: '36px',
    border: '1px solid #444',
    borderRadius: '4px',
    backgroundColor: '#2a2a2a',
    cursor: 'pointer',
    marginRight: '8px'
  },
  textInput: {
    width: 'calc(100% - 66px)',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    border: '1px solid #444',
    borderRadius: '4px',
    fontSize: '13px'
  },
  slider: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#444',
    outline: 'none',
    cursor: 'pointer'
  },
  checkboxLabel: {
    display: 'flex',
    alignItems: 'center',
    fontSize: '13px',
    cursor: 'pointer'
  },
  checkbox: {
    marginRight: '8px',
    width: '16px',
    height: '16px',
    cursor: 'pointer'
  },
  error: {
    marginTop: '6px',
    padding: '8px',
    backgroundColor: '#441111',
    color: '#ff6666',
    borderRadius: '4px',
    fontSize: '12px'
  },
  note: {
    marginTop: '16px',
    padding: '12px',
    backgroundColor: '#2a2a2a',
    borderRadius: '4px',
    color: '#999',
    fontSize: '11px',
    lineHeight: '1.5'
  },
  exportButton: {
    width: '100%',
    padding: '12px 16px',
    backgroundColor: '#00ffff',
    color: '#000',
    border: 'none',
    borderRadius: '6px',
    fontSize: '14px',
    fontWeight: '600',
    cursor: 'pointer',
    transition: 'all 0.2s',
    marginBottom: '8px'
  },
  exportNote: {
    color: '#999',
    fontSize: '11px',
    lineHeight: '1.4',
    textAlign: 'center'
  }
}
