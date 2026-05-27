/**
 * Raster (JPG/PNG) → black SVG.
 *
 * Port of im_svg_maker/raster.py. The Python version uses PIL for binarize +
 * dilate, the `potracer` Python package for trace, and shapely for the shell/
 * hole assembly XOR.
 *
 * JS port:
 *   - Jimp (pure JS, works in Node + browser) decodes the image, grayscales,
 *     applies a min-filter dilation that spreads the foreground.
 *   - The `potrace` npm package (pure JS, also Jimp-based) does the actual
 *     vector trace. It internally re-thresholds the bitmap; the dilation we
 *     did upstream just thickens the eventual traced outline.
 *   - Potrace emits SVG with a single `<path>` containing many subpaths. We
 *     parse it via svgParse — which routes the subpaths through clipper-lib's
 *     pftEvenOdd XOR — to get properly-nested polygons (outer + holes).
 *   - polygonsToSvg re-emits one `<path>` per island in the format that
 *     matches Python's fox.canonical.svg writer.
 *
 * Size-floor filters (`min_island_area_mm2`, `min_feature_width_mm`) live in
 * chunk 5's manufacturability module — chunk 4 is only the trace.
 */
import Jimp from 'jimp'
import potrace from 'potrace'

import { parseSvgToPolygons, polygonsToSvg } from './svgParse.js'

const DEFAULT_OPTS = {
  thicknessMm: 0.75,
  threshold: 128,
  turdsize: 8,
  maxLogoDimMm: 100,
}

/**
 * Coerce arbitrary input (Buffer / ArrayBuffer / Blob / File / Uint8Array)
 * into a Node Buffer Jimp can read. Browser File objects expose
 * `arrayBuffer()`; Node File doesn't, so handle both.
 */
async function toBuffer(input) {
  if (input == null) {
    throw new TypeError('preprocessRaster: input is required')
  }
  if (typeof Buffer !== 'undefined' && Buffer.isBuffer(input)) return input
  if (input instanceof Uint8Array) return Buffer.from(input)
  if (input instanceof ArrayBuffer) return Buffer.from(input)
  // Duck-type for Blob/File: the standard has `.arrayBuffer()` but jsdom
  // versions sometimes hide it behind a prototype that `typeof` can't see.
  // Try the call first, fall back to `.stream()` chunk drain if needed.
  if (typeof input.arrayBuffer === 'function') {
    return Buffer.from(await input.arrayBuffer())
  }
  if (typeof input.stream === 'function') {
    const chunks = []
    for await (const chunk of input.stream()) chunks.push(chunk)
    return Buffer.concat(chunks.map((c) => (Buffer.isBuffer(c) ? c : Buffer.from(c))))
  }
  // jsdom Blob in some versions stores bytes in an internal `_buffer` or
  // `_byteArray`; last-ditch grab.
  if (input._buffer) return Buffer.from(input._buffer)
  if (input._byteArray) return Buffer.from(input._byteArray)
  throw new TypeError(
    `preprocessRaster: input type not recognized (got ${Object.prototype.toString.call(input)})`
  )
}

/**
 * Spread the foreground (dark pixels) outward by `radius` pixels using a
 * min-filter (since foreground=0 / background=255 after threshold, min-filter
 * is morphological dilation of the foreground). Operates in place on `img`.
 *
 * Direct port of PIL's `MaxFilter(2*radius+1)` semantics on the inverted
 * binary in `raster.py`.
 */
function dilateForeground(img, radius) {
  if (radius <= 0) return
  const w = img.bitmap.width
  const h = img.bitmap.height
  const src = Buffer.from(img.bitmap.data)
  const dst = img.bitmap.data
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let minVal = 255
      const y0 = Math.max(0, y - radius)
      const y1 = Math.min(h - 1, y + radius)
      const x0 = Math.max(0, x - radius)
      const x1 = Math.min(w - 1, x + radius)
      for (let yy = y0; yy <= y1 && minVal > 0; yy++) {
        const rowStart = yy * w * 4
        for (let xx = x0; xx <= x1; xx++) {
          const v = src[rowStart + xx * 4]
          if (v < minVal) {
            minVal = v
            if (minVal === 0) break
          }
        }
      }
      const idx = (y * w + x) * 4
      dst[idx] = minVal
      dst[idx + 1] = minVal
      dst[idx + 2] = minVal
      // alpha left untouched
    }
  }
}

/**
 * @param {Buffer|ArrayBuffer|Uint8Array|Blob|File} input  raster image bytes
 * @param {Object} [opts]
 * @param {number} [opts.thicknessMm=0.75]
 * @param {number} [opts.threshold=128]
 * @param {number} [opts.turdsize=8]
 * @param {number} [opts.maxLogoDimMm=100]
 * @returns {Promise<{ svg: string, stats: { nKept: number } }>}
 */
export async function preprocessRaster(input, opts = {}) {
  const { thicknessMm, threshold, turdsize, maxLogoDimMm } = {
    ...DEFAULT_OPTS,
    ...opts,
  }

  const buf = await toBuffer(input)
  const image = await Jimp.read(buf)
  const w = image.bitmap.width
  const h = image.bitmap.height

  // Mirror raster.py's threshold convention: dark pixels < threshold become
  // foreground (black). Jimp's `.threshold({max})` does exactly this — pixels
  // at or below `max` become black, above become white.
  image.greyscale()
  image.threshold({ max: threshold })

  // Dilate the thresholded foreground by thicknessMm worth of pixels.
  // pixelsPerMm follows raster.py: max(w,h) / max_logo_dim_mm.
  const pixelsPerMm = Math.max(w, h) / maxLogoDimMm
  const thicknessPx = Math.max(0, Math.round(thicknessMm * pixelsPerMm))
  dilateForeground(image, thicknessPx)

  // Trace via potrace. The library accepts a Buffer (file bytes); we
  // serialize the post-dilate bitmap to PNG so potrace re-reads our binarized
  // pixels exactly. Passing a Jimp instance directly is not supported.
  const pngBuffer = await image.getBufferAsync(Jimp.MIME_PNG)
  const tracedSvg = await new Promise((resolve, reject) => {
    potrace.trace(
      pngBuffer,
      { turdsize, threshold: 128, optTolerance: 0.2 },
      (err, svg) => (err ? reject(err) : resolve(svg))
    )
  })

  // Potrace emits one <path> with many subpaths and (often) no explicit
  // fill-rule. Route through svgParse so clipper-lib's pftEvenOdd does the
  // shell/hole assembly the same way the Python pipeline does via shapely.
  const { polygons, viewBox } = parseSvgToPolygons(tracedSvg)

  // Preserve the source-image viewBox in the output (matches raster.py's
  // `viewBox="0 0 {w} {h}"`), regardless of what potrace reports.
  const finalSvg = polygonsToSvg(polygons, { x: 0, y: 0, w, h })

  return {
    svg: finalSvg,
    stats: { nKept: polygons.length },
  }
}
