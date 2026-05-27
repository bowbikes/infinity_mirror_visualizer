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
export default function PreprocessPanel({ onPreprocessed, onError }) {
  const [stage, setStage] = useState('idle') // 'idle' | 'picking' | 'ready'
  const [busy, setBusy] = useState(false)
  const [warning, setWarning] = useState(null)
  const [stats, setStats] = useState(null)
  const [errorMessage, setErrorMessage] = useState(null)
  // Track filename separately: <input type="file"> clears its value on every
  // open() so we'd see "No file chosen" again after re-selecting the same file.
  // Holding our own copy keeps the label honest.
  const [selectedFileName, setSelectedFileName] = useState(null)

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

  // Manufacturability sliders (mm). Nozzle defaults to 0 so the visualizer
  // preview shows the uploaded art as-is — the Python tool applies real
  // nozzle rounding at fab time. Dial it up here to *preview* the impact.
  const [nozzleDiameterMm, setNozzleDiameterMm] = useState(0)
  const [minIslandAreaMm2, setMinIslandAreaMm2] = useState(0)
  const [minFeatureWidthMm, setMinFeatureWidthMm] = useState(0)
  const [maxLogoDimMm, setMaxLogoDimMm] = useState(100)

  // Re-run manufacturability whenever a slider changes (and we have an intermediate).
  useEffect(() => {
    if (!intermediateSvg) return
    let cancelled = false
    ;(async () => {
      try {
        const { applyManufacturability } = await getPreprocessModule()
        if (cancelled) return
        const result = applyManufacturability(intermediateSvg, {
          nozzleDiameterMm,
          minIslandAreaMm2,
          minFeatureWidthMm,
          maxLogoDimMm,
        })
        if (cancelled) return
        setWarning(result.warnings.length ? result.warnings.join(' ') : null)
        setStats({
          droppedThin: result.droppedThin,
          droppedSmall: result.droppedSmall,
        })
        onPreprocessed(result.svg)
      } catch (err) {
        if (!cancelled) reportError(err.message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [
    intermediateSvg,
    nozzleDiameterMm,
    minIslandAreaMm2,
    minFeatureWidthMm,
    maxLogoDimMm,
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
  }

  const handleFileUpload = async (e) => {
    const file = e.target.files[0]
    e.target.value = '' // allow re-selecting the same file
    if (!file) return

    reset()
    setSelectedFileName(file.name)
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
          const { svg } = await preprocessRaster(buf, { maxLogoDimMm })
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
      const { svg } = await preprocessRaster(buf, { maxLogoDimMm })
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

  const pickColor = async (hex) => {
    if (!coloredSvg) return
    setBusy(true)
    try {
      const { selectByColor } = await getPreprocessModule()
      const { svg } = selectByColor(coloredSvg, { colors: [hex] })
      setIntermediateSvg(svg)
      setStage('ready')
    } catch (err) {
      reportError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Custom Art</h3>

      <div style={styles.control}>
        <label style={styles.label}>Upload JPG, PNG, or SVG:</label>
        <input
          type="file"
          accept=".svg,image/svg+xml,.jpg,.jpeg,.png,image/jpeg,image/png"
          onChange={handleFileUpload}
          disabled={busy}
          style={styles.fileInput}
        />
        {selectedFileName && (
          <div style={styles.filename}>Selected: {selectedFileName}</div>
        )}
      </div>

      {busy && <div style={styles.info}>Processing…</div>}
      {errorMessage && <div style={styles.error}>{errorMessage}</div>}

      {stage === 'picking' && (
        <div style={styles.control}>
          <label style={styles.label}>
            Which color is the cut? ({colorList.length} fills found)
          </label>
          <div style={styles.swatchGrid}>
            {colorList.map((c) => (
              <button
                key={c.hex}
                onClick={() => pickColor(c.hex)}
                disabled={busy}
                style={{ ...styles.swatch, backgroundColor: c.hex }}
                title={`${c.hex} — ${c.nPaths} path(s)`}
              />
            ))}
          </div>
          <div style={styles.note}>
            Tap a color to keep only paths with that fill. The rest of the
            artwork is discarded.
          </div>
        </div>
      )}

      {stage === 'ready' && (
        <>
          <div style={styles.control}>
            <label style={styles.label}>
              Nozzle diameter: {nozzleDiameterMm.toFixed(2)} mm
            </label>
            <input
              type="range"
              min="0"
              max="2"
              step="0.05"
              value={nozzleDiameterMm}
              onChange={(e) => setNozzleDiameterMm(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.subnote}>
              Rounds sharp corners below this radius so the printer can
              reproduce them. 0 = off.
            </div>
          </div>

          <div style={styles.control}>
            <label style={styles.label}>
              Min island area: {minIslandAreaMm2} mm²
            </label>
            <input
              type="range"
              min="0"
              max="200"
              step="1"
              value={minIslandAreaMm2}
              onChange={(e) => setMinIslandAreaMm2(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.subnote}>
              Drops islands smaller than this — kills speckles from JPG traces.
            </div>
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
              onChange={(e) => setMinFeatureWidthMm(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.subnote}>
              Drops islands whose narrowest part is below this — kills hairlines
              the printer can't make as walls.
            </div>
          </div>

          <div style={styles.control}>
            <label style={styles.label}>
              Max logo dimension: {maxLogoDimMm} mm
            </label>
            <input
              type="range"
              min="50"
              max="150"
              step="5"
              value={maxLogoDimMm}
              onChange={(e) => setMaxLogoDimMm(Number(e.target.value))}
              style={styles.slider}
            />
            <div style={styles.subnote}>
              How the art's source units convert to mm for the threshold sliders.
            </div>
          </div>

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
  fileInput: {
    width: '100%',
    padding: '8px',
    fontSize: '12px',
    color: '#ffffff',
    backgroundColor: '#2a2a2a',
    border: '1px solid #444',
    borderRadius: '4px',
  },
  filename: {
    marginTop: '6px',
    fontSize: '12px',
    color: '#9cd0ff',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
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
    border: '2px solid #444',
    borderRadius: '4px',
    cursor: 'pointer',
    padding: 0,
  },
}
