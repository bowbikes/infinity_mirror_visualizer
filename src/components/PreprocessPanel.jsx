import { useEffect, useState } from 'react'

// Preprocessing pulls in jimp/potrace/clipper-lib (~200 KB after gzip) and
// is only needed once the user uploads a file. Lazy-load on first use so
// the initial bundle stays slim for visitors who only browse the presets.
let _preprocessModulePromise = null
function getPreprocessModule() {
  if (!_preprocessModulePromise) {
    _preprocessModulePromise = import('../preprocess/index.js')
  }
  return _preprocessModulePromise
}

// Stroke-only SVG → PNG bytes. The browser natively draws SVG strokes when
// we render via an <img> into a canvas, so we let it do the heavy lifting.
// The result feeds straight into preprocessRaster (binarize → dilate →
// trace), matching the JPG upload path. Background is filled white so the
// post-canvas image has a defined contrast for thresholding.
const RASTERIZE_TARGET_PX = 1024
async function rasterizeSvgToBytes(svgText, targetSize = RASTERIZE_TARGET_PX) {
  const svgBlob = new Blob([svgText], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await new Promise((resolve, reject) => {
      const im = new Image()
      im.onload = () => resolve(im)
      im.onerror = () =>
        reject(new Error('SVG failed to load for rasterization.'))
      im.src = url
    })
    const sw = img.naturalWidth || 200
    const sh = img.naturalHeight || 200
    const scale = targetSize / Math.max(sw, sh)
    const dw = Math.max(1, Math.round(sw * scale))
    const dh = Math.max(1, Math.round(sh * scale))

    const canvas = document.createElement('canvas')
    canvas.width = dw
    canvas.height = dh
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, dw, dh)
    ctx.drawImage(img, 0, 0, dw, dh)

    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Canvas → blob failed.'))), 'image/png')
    })
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * PreprocessPanel — accepts a JPG/PNG/SVG, walks the user through whatever
 * preprocessing the input needs (raster trace + manufacturability for JPGs,
 * color-pick + manufacturability for multi-fill SVGs, manufacturability-only
 * for already-black SVGs), and hands the resulting black SVG to the parent
 * via `onPreprocessed`.
 *
 * The state machine has three stops:
 *   - idle       : no file uploaded yet (or user reset)
 *   - picking    : a multi-color SVG was uploaded, awaiting color selection
 *   - ready      : preprocessing complete; `customSvgPath` reflects the result.
 *                  Adjusting the manufacturability sliders re-runs against
 *                  the cached pre-manufacturability SVG.
 *
 * The manufacturability sliders edit live values; any change re-runs
 * applyManufacturability against the cached intermediate. This makes the
 * "what does the printer actually see?" loop instant without re-tracing.
 */
export default function PreprocessPanel({
  onPreprocessed,
  onError,
  onFileNameChange,
}) {
  // Warm the lazy preprocess module on mount. The module pulls in
  // jimp/potrace/clipper-lib (~200 KB after gzip) and isn't fetched
  // until a user uploads a file. Kicking the import off here means
  // the network round-trip happens while the user is still hunting
  // for their file in the OS picker, not after they pick.
  useEffect(() => {
    getPreprocessModule()
  }, [])

  const [stage, setStage] = useState('idle') // 'idle' | 'picking' | 'ready'
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState(null)
  const [stats, setStats] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  // Track filename separately: <input type="file"> clears its value on every
  // open() so we'd see "No file chosen" again after re-selecting the same file.
  // Holding our own copy keeps the label honest.
  const [selectedFileName, setSelectedFileName] = useState(null)
  // Preview thumbnail is shown by default; users with small viewports or
  // who've already validated the art can collapse it.
  const [thumbnailHidden, setThumbnailHidden] = useState(false)

  const reportError = (msg) => {
    setErrorMessage(msg)
    onError?.(msg)
  }

  // intermediate cached BLACK SVG (after raster trace or color-pick, before
  // manufacturability). Re-running applyManufacturability with new sliders
  // operates on this — no re-trace needed.
  const [intermediateSvg, setIntermediateSvg] = useState(null)

  // multi-color SVG state: original SVG text + the list of distinct fills.
  const [coloredSvg, setColoredSvg] = useState(null)
  const [colorList, setColorList] = useState([])

  // Nozzle diameters the printer can actually swap to. Continuous values
  // would imply we support arbitrary nozzles, which we don't — pick from
  // the stocked set. 0 = "don't apply nozzle rounding at all" (preview only).
  const NOZZLE_OPTIONS = [0, 0.25, 0.4, 0.6, 0.8, 1.0]
  const DEFAULT_NOZZLE = 0.6

  // Derive sensible thresholds from nozzle geometry:
  //   - min island area = circle of one nozzle stroke, ceil'd to 0.1 mm²
  //     (anything smaller than the nozzle's own footprint can't print as
  //     a discrete island)
  //   - min feature width = nozzle diameter (one stroke wide, no thinner)
  const minIslandFromNozzle = (d) =>
    Math.ceil(Math.PI * (d / 2) * (d / 2) * 10) / 10
  const minFeatureFromNozzle = (d) => d

  // Visualizer-internal: maxLogoDim only affects the unit conversion for
  // the manufacturability thresholds, not anything visible in the 3D
  // preview. Hard-coded to the previous slider default — users with a
  // strong opinion about absolute mm thresholds can adjust min-island /
  // min-feature directly.
  const MAX_LOGO_DIM_MM = 100

  const [nozzleDiameterMm, setNozzleDiameterMm] = useState(DEFAULT_NOZZLE)
  const [minIslandAreaMm2, setMinIslandAreaMm2] = useState(
    minIslandFromNozzle(DEFAULT_NOZZLE)
  )
  const [minFeatureWidthMm, setMinFeatureWidthMm] = useState(
    minFeatureFromNozzle(DEFAULT_NOZZLE)
  )
  // If the user moves min-island or min-feature manually, stop yanking
  // them around when nozzle changes. Resets to false on full reset().
  const [minIslandOverridden, setMinIslandOverridden] = useState(false)
  const [minFeatureOverridden, setMinFeatureOverridden] = useState(false)

  const handleNozzleChange = (d) => {
    setNozzleDiameterMm(d)
    if (!minIslandOverridden) setMinIslandAreaMm2(minIslandFromNozzle(d))
    if (!minFeatureOverridden) setMinFeatureWidthMm(minFeatureFromNozzle(d))
  }

  // Most recent post-manufacturability SVG — rendered as an inline
  // thumbnail so the user can see what the printer sees without having
  // to look at the 3D canvas. Kept in addition to onPreprocessed (which
  // also receives the SVG) so the thumbnail lives inside this component.
  const [processedSvg, setProcessedSvg] = useState(null)

  // Re-run manufacturability whenever a slider changes. Slider drags
  // can pile up dozens of re-runs per second on dense art, so debounce
  // both the start (wait until the user pauses) and the cancellation
  // (drop in-flight work if a new value lands).
  const RECOMPUTE_DEBOUNCE_MS = 150
  useEffect(() => {
    if (!intermediateSvg) return
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const { applyManufacturability } = await getPreprocessModule()
        if (cancelled) return
        const result = applyManufacturability(intermediateSvg, {
          nozzleDiameterMm,
          minIslandAreaMm2,
          minFeatureWidthMm,
          maxLogoDimMm: MAX_LOGO_DIM_MM,
        })
        if (cancelled) return
        setWarning(result.warnings.length ? result.warnings.join(' ') : null)
        setStats({
          droppedThin: result.droppedThin,
          droppedSmall: result.droppedSmall,
        })
        setProcessedSvg(result.svg)
        onPreprocessed(result.svg)
      } catch (err) {
        if (!cancelled) reportError(err.message)
      }
    }, RECOMPUTE_DEBOUNCE_MS)
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [
    intermediateSvg,
    nozzleDiameterMm,
    minIslandAreaMm2,
    minFeatureWidthMm,
  ])

  const reset = () => {
    setStage('idle')
    setIntermediateSvg(null)
    setColoredSvg(null)
    setColorList([])
    setWarning(null)
    setStats(null)
    setErrorMessage(null)
    setSelectedFileName(null)
    setProcessedSvg(null)
    setAdvancedOpen(false)
    setNozzleDiameterMm(DEFAULT_NOZZLE)
    setMinIslandAreaMm2(minIslandFromNozzle(DEFAULT_NOZZLE))
    setMinFeatureWidthMm(minFeatureFromNozzle(DEFAULT_NOZZLE))
    setMinIslandOverridden(false)
    setMinFeatureOverridden(false)
    setPickedColors([])
    setThumbnailHidden(false)
  }

  // Advanced manufacturability sliders are collapsed by default. The vast
  // majority of users want "upload → done" — they only need to crack open
  // the tuners when the dropped-feature stats or the rendered preview
  // signal that defaults aren't working for their art.
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    reset()
    setSelectedFileName(file.name)
    onFileNameChange?.(file.name)
    setBusy(true)
    try {
      const isSvg =
        file.type === 'image/svg+xml' || file.name.toLowerCase().endsWith('.svg')

      const { preprocessRaster, listColors, strokesToBlackSvg } =
        await getPreprocessModule()

      if (isSvg) {
        const text = await file.text()
        // Branch on what the SVG actually contains:
        //   >1 fills   → color picker (user picks which is the cut)
        //   1 fill     → passthrough (already-black SVG)
        //   0 fills    → try vector stroke-to-fill (lossless, exact source
        //                stroke widths); if no strokes either, fall back to
        //                rasterize-then-trace via canvas.
        const colors = listColors(text)
        if (colors.length > 1) {
          setColoredSvg(text)
          setColorList(colors)
          setStage('picking')
          return
        }
        if (colors.length === 0) {
          const strokeSvg = strokesToBlackSvg(text)
          if (strokeSvg) {
            setIntermediateSvg(strokeSvg)
            setStage('ready')
            return
          }
          // No fills, no strokes — rasterize via canvas as last resort.
          const buf = await rasterizeSvgToBytes(text)
          const { svg } = await preprocessRaster(buf, { maxLogoDimMm: MAX_LOGO_DIM_MM })
          setIntermediateSvg(svg)
          setStage('ready')
          return
        }
        setIntermediateSvg(text)
        setStage('ready')
        return
      }

      // Raster path (JPG / PNG / anything not SVG).
      const buf = new Uint8Array(await file.arrayBuffer())
      const { svg } = await preprocessRaster(buf, { maxLogoDimMm: MAX_LOGO_DIM_MM })
      setIntermediateSvg(svg)
      setStage('ready')
    } catch (err) {
      // Clear the half-processed intermediate without nuking the error
      // message we're about to render (reset() would have cleared it).
      setStage('idle')
      setIntermediateSvg(null)
      setColoredSvg(null)
      setColorList([])
      setWarning(null)
      setStats(null)
      reportError(err.message || String(err))
    } finally {
      setBusy(false)
    }
  }

  // Multi-color picker state: which fills the user has tapped on. The
  // single-tap flow was lossy for art whose "cut" spans several near-black
  // fills, so the picker now batches: tap to toggle, Apply to commit.
  const [pickedColors, setPickedColors] = useState([])
  const togglePickedColor = (hex) => {
    setPickedColors((prev) =>
      prev.includes(hex) ? prev.filter((h) => h !== hex) : [...prev, hex]
    )
  }

  const applyPickedColors = async () => {
    if (!coloredSvg || pickedColors.length === 0) return
    setBusy(true)
    try {
      const { selectByColor } = await getPreprocessModule()
      const { svg } = selectByColor(coloredSvg, { colors: pickedColors })
      setIntermediateSvg(svg)
      setStage('ready')
    } catch (err) {
      reportError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={styles.control}>
        <label style={styles.label}>Upload JPG, PNG, or SVG:</label>
        {/* Custom-styled file input. The native <input type="file"> always
            renders a browser "Choose File / No file chosen" label that we
            can't restyle and that we don't want showing the stale "No file
            chosen" after every upload (we clear e.target.value so the user
            can re-select the same file). Hide it visually, drive it from a
            label that shows our own state. */}
        <label style={{ ...styles.uploadButton, opacity: busy ? 0.6 : 1 }}>
          <span>{selectedFileName || 'Choose file…'}</span>
          <input
            type="file"
            accept=".svg,image/svg+xml,.jpg,.jpeg,.png,image/jpeg,image/png"
            onChange={handleFileUpload}
            disabled={busy}
            style={styles.hiddenInput}
          />
        </label>
      </div>

      {busy && <div style={styles.info}>Processing…</div>}
      {errorMessage && <div style={styles.error}>{errorMessage}</div>}

      {stage === 'picking' && (
        <div style={styles.control}>
          <label style={styles.label}>
            Which color(s) make up the cut? ({colorList.length} fills found)
          </label>
          <div style={styles.swatchGrid}>
            {colorList.map((c) => {
              const picked = pickedColors.includes(c.hex)
              return (
                <button
                  key={c.hex}
                  onClick={() => togglePickedColor(c.hex)}
                  disabled={busy}
                  style={{
                    ...styles.swatch,
                    backgroundColor: c.hex,
                    ...(picked ? styles.swatchPicked : null),
                  }}
                  title={`${c.hex} — ${c.nPaths} path(s)`}
                >
                  {picked ? '✓' : ''}
                </button>
              )
            })}
          </div>
          <div style={styles.note}>
            Tap colors to include them in the cut. The rest of the artwork
            is discarded.
          </div>
          <button
            type="button"
            onClick={applyPickedColors}
            disabled={busy || pickedColors.length === 0}
            style={{
              ...styles.applyPickedButton,
              ...(pickedColors.length === 0
                ? styles.applyPickedButtonDisabled
                : null),
            }}
          >
            {pickedColors.length === 0
              ? 'Select at least one color'
              : `Apply (${pickedColors.length} ${
                  pickedColors.length === 1 ? 'color' : 'colors'
                })`}
          </button>
        </div>
      )}

      {stage === 'ready' && (
        <>
          {processedSvg && (
            <div style={styles.thumbnailWrap}>
              <div style={styles.thumbnailHeader}>
                <span style={styles.subnote}>
                  Preview — black = illuminated segments, white = mirror base.
                </span>
                <button
                  type="button"
                  onClick={() => setThumbnailHidden((v) => !v)}
                  style={styles.thumbnailToggle}
                >
                  {thumbnailHidden ? 'Show' : 'Hide'}
                </button>
              </div>
              {!thumbnailHidden && (
                <img
                  src={`data:image/svg+xml;utf8,${encodeURIComponent(processedSvg)}`}
                  alt="Preprocessed artwork preview"
                  style={styles.thumbnail}
                />
              )}
            </div>
          )}

          {warning && <div style={styles.warning}>{warning}</div>}
          {stats && (stats.droppedThin > 0 || stats.droppedSmall > 0) && (
            <div style={styles.statsRow}>
              {stats.droppedThin > 0 && (
                <span>Dropped {stats.droppedThin} hairline(s) </span>
              )}
              {stats.droppedSmall > 0 && (
                <span>Dropped {stats.droppedSmall} speck(s)</span>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            style={styles.advancedToggle}
          >
            {advancedOpen ? '▾' : '▸'} Advanced (manufacturability)
          </button>

          {advancedOpen && (
            <>
              <div style={styles.control}>
                <label style={styles.label}>
                  Nozzle diameter: {nozzleDiameterMm.toFixed(2)} mm
                </label>
                <div style={styles.nozzleRow}>
                  {NOZZLE_OPTIONS.map((d) => {
                    const active = nozzleDiameterMm === d
                    return (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleNozzleChange(d)}
                        style={{
                          ...styles.nozzleChip,
                          ...(active ? styles.nozzleChipActive : null),
                        }}
                      >
                        {d === 0 ? 'off' : d.toFixed(2)}
                      </button>
                    )
                  })}
                </div>
                <div style={styles.subnote}>
                  Rounds sharp corners below this radius so the printer can
                  reproduce them.
                </div>
                {nozzleDiameterMm === 0 && (
                  <div style={styles.previewMismatchWarn}>
                    The finished product will not be as fine as the rendered
                    preview.
                  </div>
                )}
              </div>

              <div style={styles.control}>
                <label style={styles.label}>
                  Min island area: {minIslandAreaMm2.toFixed(1)} mm²
                </label>
                <input
                  type="range"
                  min="0"
                  max="10"
                  step="0.1"
                  value={minIslandAreaMm2}
                  onChange={(e) => {
                    setMinIslandAreaMm2(Number(e.target.value))
                    setMinIslandOverridden(true)
                  }}
                  style={styles.slider}
                />
                <div style={styles.subnote}>
                  Drops islands smaller than this — kills speckles from JPG traces.
                </div>
                {minIslandAreaMm2 === 0 && (
                  <div style={styles.previewMismatchWarn}>
                    The finished product will not be as fine as the rendered
                    preview.
                  </div>
                )}
              </div>

              <div style={styles.control}>
                <label style={styles.label}>
                  Min feature width: {minFeatureWidthMm.toFixed(2)} mm
                </label>
                <input
                  type="range"
                  min="0"
                  max="5"
                  step="0.1"
                  value={minFeatureWidthMm}
                  onChange={(e) => {
                    setMinFeatureWidthMm(Number(e.target.value))
                    setMinFeatureOverridden(true)
                  }}
                  style={styles.slider}
                />
                <div style={styles.subnote}>
                  Drops islands whose narrowest part is below this — kills hairlines
                  the printer can't make as walls.
                </div>
                {minFeatureWidthMm === 0 && (
                  <div style={styles.previewMismatchWarn}>
                    The finished product will not be as fine as the rendered
                    preview.
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

const styles = {
  section: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: '600',
    textTransform: 'uppercase',
    color: '#999',
  },
  control: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    marginBottom: '6px',
    fontSize: '13px',
    color: '#ccc',
  },
  uploadButton: {
    display: 'block',
    width: '100%',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#ffffff',
    backgroundColor: '#2a2a2a',
    border: '1px solid #555',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'center',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    boxSizing: 'border-box',
  },
  hiddenInput: {
    position: 'absolute',
    width: '1px',
    height: '1px',
    padding: 0,
    margin: '-1px',
    overflow: 'hidden',
    clip: 'rect(0, 0, 0, 0)',
    border: 0,
  },
  slider: {
    width: '100%',
    height: '4px',
    borderRadius: '2px',
    backgroundColor: '#444',
    outline: 'none',
    cursor: 'pointer',
  },
  info: {
    margin: '8px 0',
    padding: '8px',
    backgroundColor: '#1a3340',
    color: '#9cd0ff',
    borderRadius: '4px',
    fontSize: '12px',
  },
  error: {
    margin: '8px 0',
    padding: '8px',
    backgroundColor: '#441111',
    color: '#ff6666',
    borderRadius: '4px',
    fontSize: '12px',
  },
  warning: {
    margin: '8px 0',
    padding: '8px',
    backgroundColor: '#4a3a10',
    color: '#ffd066',
    borderRadius: '4px',
    fontSize: '12px',
  },
  statsRow: {
    marginTop: '4px',
    fontSize: '11px',
    color: '#999',
  },
  note: {
    marginTop: '6px',
    padding: '8px',
    backgroundColor: '#2a2a2a',
    borderRadius: '4px',
    color: '#999',
    fontSize: '11px',
    lineHeight: '1.4',
  },
  subnote: {
    marginTop: '4px',
    color: '#777',
    fontSize: '11px',
    lineHeight: '1.4',
  },
  swatchGrid: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  swatch: {
    width: '36px',
    height: '36px',
    borderWidth: '2px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
    fontSize: '14px',
    fontWeight: 700,
    color: '#000',
    textShadow: '0 0 4px #fff, 0 0 4px #fff',
  },
  swatchPicked: {
    borderColor: '#00ffff',
    boxShadow: '0 0 0 2px #00ffff inset',
  },
  applyPickedButton: {
    width: '100%',
    marginTop: '8px',
    padding: '8px 12px',
    fontSize: '13px',
    backgroundColor: '#00ffff',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  },
  applyPickedButtonDisabled: {
    backgroundColor: '#2a2a2a',
    color: '#777',
    cursor: 'not-allowed',
  },
  nozzleRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
  },
  nozzleChip: {
    flex: '1 1 0',
    minWidth: 0,
    padding: '6px 4px',
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
  nozzleChipActive: {
    backgroundColor: '#00ffff',
    color: '#000',
    borderColor: '#00ffff',
    fontWeight: 600,
  },
  previewMismatchWarn: {
    marginTop: '6px',
    padding: '6px 8px',
    backgroundColor: '#4a3a10',
    color: '#ffd066',
    borderRadius: '4px',
    fontSize: '11px',
    lineHeight: '1.4',
  },
  thumbnailWrap: {
    marginBottom: '12px',
  },
  thumbnailHeader: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginBottom: '6px',
  },
  thumbnailToggle: {
    padding: '3px 8px',
    fontSize: '11px',
    color: '#999',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
  thumbnail: {
    width: '100%',
    aspectRatio: '1 / 1',
    backgroundColor: '#ffffff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    objectFit: 'contain',
    padding: '8px',
    boxSizing: 'border-box',
  },
  advancedToggle: {
    display: 'block',
    width: '100%',
    marginTop: '8px',
    padding: '8px 10px',
    fontSize: '12px',
    color: '#ccc',
    backgroundColor: 'transparent',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
  },
}
