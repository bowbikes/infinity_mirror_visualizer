/**
 * ControlsPanel — visualizer customization controls.
 *
 * Custom art upload + preprocessing live in the `topSection` (PreprocessPanel)
 * injected from App.jsx. This panel only renders the preset picker, colors,
 * frame dimensions, transform, camera, and export controls.
 */
import { useEffect, useState } from 'react'

/**
 * Slider + numeric input pair with a tooltip indicator. Double-clicking the
 * label resets the value to `defaultValue` — saves users who slid something
 * to an extreme and want the starting point back. Numeric input mirrors the
 * slider; both clamp to [min, max] on blur.
 */
function SliderControl({
  label,
  value,
  defaultValue,
  min,
  max,
  step,
  onChange,
  format,
  tooltip,
  suffix,
}) {
  const display = format ? format(value) : value
  const handleNumeric = (raw) => {
    if (raw === '' || raw === '-') return // mid-typing; ignore
    const n = Number(raw)
    if (!Number.isFinite(n)) return
    const clamped = Math.min(max, Math.max(min, n))
    onChange(clamped)
  }
  return (
    <div style={styles.control}>
      <div style={styles.sliderHeaderRow}>
        <label
          style={styles.label}
          title={tooltip}
          onDoubleClick={() => onChange(defaultValue)}
        >
          {label}: {display}
          {suffix ?? ''}
          {tooltip && <span style={styles.helpIcon} title={tooltip}> ⓘ</span>}
        </label>
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          step={step}
          onChange={(e) => handleNumeric(e.target.value)}
          style={styles.numericInput}
        />
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={styles.slider}
      />
    </div>
  )
}

/**
 * Hex color text input with validation: while typing the value is held in
 * local state; on blur (or Enter) it's parsed — valid 3- or 6-digit hex
 * commits upstream, anything else reverts and flashes a red border.
 */
function HexInput({ value, onChange }) {
  const [draft, setDraft] = useState(value)
  const [invalid, setInvalid] = useState(false)
  // Re-sync when the canonical value changes from outside (e.g. color
  // picker).
  useEffect(() => {
    setDraft(value)
    setInvalid(false)
  }, [value])
  const commit = () => {
    const cleaned = draft.trim()
    if (/^#?[0-9a-fA-F]{6}$/.test(cleaned) || /^#?[0-9a-fA-F]{3}$/.test(cleaned)) {
      const withHash = cleaned.startsWith('#') ? cleaned : `#${cleaned}`
      onChange(withHash.toLowerCase())
      setInvalid(false)
    } else {
      setDraft(value)
      setInvalid(true)
    }
  }
  return (
    <input
      type="text"
      value={draft}
      onChange={(e) => {
        setDraft(e.target.value)
        if (invalid) setInvalid(false)
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.currentTarget.blur()
        }
      }}
      style={{
        ...styles.textInput,
        ...(invalid ? styles.textInputInvalid : null),
      }}
      placeholder="#000000"
    />
  )
}

export default function ControlsPanel({
  customArtSection,
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
  enableBloom,
  onEnableBloomChange,
  onExportClick,
  defaults,
  onResetAll,
  onCopyShareLink,
}) {
  // Ephemeral "Copied!" feedback on the share-link button.
  const [shareCopied, setShareCopied] = useState(false)
  const handleShareClick = async () => {
    const ok = await onCopyShareLink?.()
    if (ok) {
      setShareCopied(true)
      setTimeout(() => setShareCopied(false), 1500)
    }
  }

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
      <div style={styles.titleRow}>
        <h2 style={styles.title}>Infinity Mirror Configurator</h2>
        <button
          type="button"
          onClick={onResetAll}
          style={styles.resetAllButton}
          title="Reset every control to its starting value. Custom art is preserved."
        >
          Reset all
        </button>
      </div>

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
      </div>

      {/* Custom Art preprocessing surface — appears directly below Icon
          when the user selects Custom Upload, hidden otherwise. */}
      {customArtSection}

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
          <HexInput value={wallColor} onChange={onWallColorChange} />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Frame:</label>
          <input
            type="color"
            value={frameColor}
            onChange={(e) => onFrameColorChange(e.target.value)}
            style={styles.colorInput}
          />
          <HexInput value={frameColor} onChange={onFrameColorChange} />
        </div>

        <div style={styles.control}>
          <label style={styles.label}>Light:</label>
          <input
            type="color"
            value={lightColor}
            onChange={(e) => onLightColorChange(e.target.value)}
            style={styles.colorInput}
          />
          <HexInput value={lightColor} onChange={onLightColorChange} />
        </div>
      </div>

      {/* Frame Controls */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Frame Controls</h3>

        <div style={styles.control}>
          <label style={styles.label}>Units:</label>
          <div style={styles.unitToggle}>
            <button
              type="button"
              onClick={() => onUnitsChange('mm')}
              style={{
                ...styles.unitToggleButton,
                ...(units === 'mm' ? styles.unitToggleButtonActive : null),
              }}
            >
              mm
            </button>
            <button
              type="button"
              onClick={() => onUnitsChange('in')}
              style={{
                ...styles.unitToggleButton,
                ...(units === 'in' ? styles.unitToggleButtonActive : null),
              }}
            >
              in
            </button>
          </div>
        </div>

        <SliderControl
          label="Width"
          value={frameWidth}
          defaultValue={defaults.frameWidth}
          min={100}
          max={600}
          step={10}
          onChange={onFrameWidthChange}
          format={(v) =>
            units === 'mm' ? `${v}mm` : `${(v / 25.4).toFixed(2)}in`
          }
          tooltip="Outer width of the mirror frame. Double-click the label to reset."
        />

        <SliderControl
          label="Height"
          value={frameHeight}
          defaultValue={defaults.frameHeight}
          min={100}
          max={600}
          step={10}
          onChange={onFrameHeightChange}
          format={(v) =>
            units === 'mm' ? `${v}mm` : `${(v / 25.4).toFixed(2)}in`
          }
          tooltip="Outer height of the mirror frame."
        />

        <SliderControl
          label="Frame Depth"
          value={frameDepthMm}
          defaultValue={defaults.frameDepthMm}
          min={21}
          max={130}
          step={2}
          onChange={onFrameDepthChange}
          format={(v) =>
            units === 'mm' ? `${v}mm` : `${(v / 25.4).toFixed(2)}in`
          }
          tooltip="Distance between the two-way and back mirrors. Larger depth makes the apparent tunnel longer."
        />

        <SliderControl
          label="Layers"
          value={reflectionDepth}
          defaultValue={defaults.reflectionDepth}
          min={4}
          max={20}
          step={1}
          onChange={onReflectionDepthChange}
          tooltip="Number of reflection iterations rendered. Lower this on mobile or older GPUs if the scene stutters."
        />

        <div style={styles.control}>
          <label style={styles.checkboxLabel}>
            <input
              type="checkbox"
              checked={autoOrbit}
              onChange={(e) => onAutoOrbitChange(e.target.checked)}
              style={styles.checkbox}
            />
            Auto-orbit camera
          </label>
        </div>

        <div style={styles.control}>
          <label
            style={styles.checkboxLabel}
            title="Adds a neon bloom post-process to the light color. Costs GPU; disable on older mobile hardware if the scene stutters."
          >
            <input
              type="checkbox"
              checked={enableBloom}
              onChange={(e) => onEnableBloomChange(e.target.checked)}
              style={styles.checkbox}
            />
            Bloom glow
          </label>
        </div>
      </div>

      {/* SVG Transform */}
      <div style={styles.section}>
        <h3 style={styles.sectionTitle}>Icon Transform</h3>

        <SliderControl
          label="Scale"
          value={iconScale}
          defaultValue={defaults.iconScale}
          min={0.1}
          max={10}
          step={0.1}
          onChange={onIconScaleChange}
          format={(v) => v.toFixed(2)}
          tooltip="Icon size as a multiple of its source. 1.00 = source size."
        />

        <SliderControl
          label="Rotation"
          value={iconRotation}
          defaultValue={defaults.iconRotation}
          min={0}
          max={360}
          step={5}
          onChange={onIconRotationChange}
          format={(v) => `${Math.round(v)}°`}
          tooltip="Icon rotation in degrees."
        />

        <SliderControl
          label="Position X"
          value={iconPositionX}
          defaultValue={defaults.iconPositionX}
          min={-1.5}
          max={1.5}
          step={0.1}
          onChange={onIconPositionXChange}
          format={(v) => v.toFixed(1)}
          tooltip="Horizontal offset, in frame widths. 0 = centered."
        />

        <SliderControl
          label="Position Y"
          value={iconPositionY}
          defaultValue={defaults.iconPositionY}
          min={-1.5}
          max={1.5}
          step={0.1}
          onChange={onIconPositionYChange}
          format={(v) => v.toFixed(1)}
          tooltip="Vertical offset, in frame heights. 0 = centered."
        />

        <div style={styles.subsectionTitle}>Appearance</div>

        <SliderControl
          label="Edge Thickness"
          value={edgeThickness}
          defaultValue={defaults.edgeThickness}
          min={0}
          max={1}
          step={0.01}
          onChange={onEdgeThicknessChange}
          format={(v) => v.toFixed(2)}
          tooltip="Dilates the icon outward — thin lines get thicker, solid shapes get larger. Scales with the Scale slider (the cut lines on a bigger printed icon are physically thicker). 0 = source art unchanged."
        />
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
            Bundles the configuration with a SHA-256 integrity hash for the
            manufacturer to verify against.
          </small>
        </div>
        <button
          type="button"
          onClick={handleShareClick}
          style={styles.shareLinkButton}
          title="Copy a URL that restores this exact configuration. Custom-art uploads are not included."
        >
          {shareCopied ? 'Link copied!' : 'Copy share link'}
        </button>
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
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    margin: '0 0 20px 0',
  },
  title: {
    margin: 0,
    fontSize: '20px',
    fontWeight: '600'
  },
  resetAllButton: {
    padding: '6px 10px',
    fontSize: '11px',
    backgroundColor: 'transparent',
    color: '#999',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
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
  subsectionTitle: {
    margin: '8px 0 10px 0',
    paddingTop: '8px',
    borderTop: '1px solid #2a2a2a',
    fontSize: '11px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#777',
    letterSpacing: '0.04em',
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
  helpIcon: {
    color: '#666',
    cursor: 'help',
    fontSize: '12px',
  },
  sliderHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '4px',
  },
  numericInput: {
    width: '64px',
    padding: '4px 6px',
    backgroundColor: '#2a2a2a',
    color: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    fontSize: '12px',
    fontFamily: 'inherit',
    boxSizing: 'border-box',
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
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    fontSize: '13px'
  },
  textInputInvalid: {
    borderColor: '#ff6666',
  },
  slider: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#444',
    outline: 'none',
    cursor: 'pointer'
  },
  unitToggle: {
    display: 'flex',
    gap: '4px',
  },
  unitToggleButton: {
    flex: 1,
    padding: '6px 0',
    fontSize: '12px',
    backgroundColor: '#2a2a2a',
    color: '#ccc',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  unitToggleButtonActive: {
    backgroundColor: '#00ffff',
    color: '#000',
    borderColor: '#00ffff',
    fontWeight: 600,
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
  },
  shareLinkButton: {
    width: '100%',
    marginTop: '12px',
    padding: '8px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: '#ccc',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
}
