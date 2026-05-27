/**
 * Preprocessing pipeline — port of the IM_SVG_Maker Python tool.
 *
 * The public API mirrors the Python CLI entry points so reasoning stays
 * consistent across implementations:
 *
 *   - preprocessRaster(file, opts)   ↔ scripts/raster_to_black_svg.py
 *   - listColors(svgString)          ↔ scripts/color_svg_to_black.py (list mode)
 *   - selectByColor(svgString, opts) ↔ scripts/color_svg_to_black.py (extract mode)
 *   - applyManufacturability(svg, opts) ↔ raster._apply_thresholds + nozzle rounding
 *
 * Each function takes/returns plain strings (SVG text), so they're pure and
 * test-friendly. The 3D scene downstream consumes the output string via the
 * existing Three.js SVGLoader path.
 *
 * Implementation status: chunk 1 (skeleton). All modules are pass-through
 * stubs; parity tests fail loudly until each chunk lands.
 *   chunk 2: colorSelect.js
 *   chunk 3: svgParse helpers
 *   chunk 4: raster.js (binarize + dilate + trace)
 *   chunk 5: sizeFloors.js + nozzleRound.js
 *   chunk 6: UI wire-up (separate components, not here)
 */

export { preprocessRaster } from './raster.js'
export { listColors, selectByColor } from './colorSelect.js'
export { applyManufacturability } from './manufacturability.js'
