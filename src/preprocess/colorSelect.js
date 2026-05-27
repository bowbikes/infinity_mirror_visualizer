/**
 * Colored SVG → black SVG by fill-color selection.
 *
 * Port of im_svg_maker/color_select.py. Python uses svgelements with
 * reify=True to resolve transforms and CSS/inheritance through to a
 * computed fill. In the browser/jsdom we walk the DOM ourselves:
 *
 *   - fill: read inline `style="fill:..."` first (higher precedence than
 *     attribute), then `fill="..."` attribute, then inherit from parent.
 *     Default to "#000000" if nothing in the chain (SVG spec for filled
 *     shapes). Skip "none", gradients, and unparseable specs.
 *   - transform: walk leaf→root, compose as M = root · parent · ... · leaf
 *     using DOMMatrix, then apply the resulting matrix to the path d-string
 *     via svgpath.matrix(). This matches what svgelements' reify=True does.
 *
 * Output mirrors the Python writer exactly: flat list of
 *   <path d="..." fill="#000000" fill-rule="evenodd"/>
 * with the original viewBox preserved.
 */

import SvgPath from 'svgpath'

/* ---------------- Color spec parsing ---------------- */

// CSS Color Module Level 3 named colors. Inline so we don't add another dep.
const NAMED_COLORS = {
  aliceblue: '#f0f8ff', antiquewhite: '#faebd7', aqua: '#00ffff',
  aquamarine: '#7fffd4', azure: '#f0ffff', beige: '#f5f5dc',
  bisque: '#ffe4c4', black: '#000000', blanchedalmond: '#ffebcd',
  blue: '#0000ff', blueviolet: '#8a2be2', brown: '#a52a2a',
  burlywood: '#deb887', cadetblue: '#5f9ea0', chartreuse: '#7fff00',
  chocolate: '#d2691e', coral: '#ff7f50', cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc', crimson: '#dc143c', cyan: '#00ffff',
  darkblue: '#00008b', darkcyan: '#008b8b', darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9', darkgreen: '#006400', darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b', darkmagenta: '#8b008b', darkolivegreen: '#556b2f',
  darkorange: '#ff8c00', darkorchid: '#9932cc', darkred: '#8b0000',
  darksalmon: '#e9967a', darkseagreen: '#8fbc8f', darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f', darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1', darkviolet: '#9400d3', deeppink: '#ff1493',
  deepskyblue: '#00bfff', dimgray: '#696969', dimgrey: '#696969',
  dodgerblue: '#1e90ff', firebrick: '#b22222', floralwhite: '#fffaf0',
  forestgreen: '#228b22', fuchsia: '#ff00ff', gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff', gold: '#ffd700', goldenrod: '#daa520',
  gray: '#808080', green: '#008000', greenyellow: '#adff2f',
  grey: '#808080', honeydew: '#f0fff0', hotpink: '#ff69b4',
  indianred: '#cd5c5c', indigo: '#4b0082', ivory: '#fffff0',
  khaki: '#f0e68c', lavender: '#e6e6fa', lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00', lemonchiffon: '#fffacd', lightblue: '#add8e6',
  lightcoral: '#f08080', lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2', lightgray: '#d3d3d3',
  lightgreen: '#90ee90', lightgrey: '#d3d3d3', lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a', lightseagreen: '#20b2aa', lightskyblue: '#87cefa',
  lightslategray: '#778899', lightslategrey: '#778899',
  lightsteelblue: '#b0c4de', lightyellow: '#ffffe0', lime: '#00ff00',
  limegreen: '#32cd32', linen: '#faf0e6', magenta: '#ff00ff',
  maroon: '#800000', mediumaquamarine: '#66cdaa', mediumblue: '#0000cd',
  mediumorchid: '#ba55d3', mediumpurple: '#9370db', mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee', mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc', mediumvioletred: '#c71585',
  midnightblue: '#191970', mintcream: '#f5fffa', mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5', navajowhite: '#ffdead', navy: '#000080',
  oldlace: '#fdf5e6', olive: '#808000', olivedrab: '#6b8e23',
  orange: '#ffa500', orangered: '#ff4500', orchid: '#da70d6',
  palegoldenrod: '#eee8aa', palegreen: '#98fb98', paleturquoise: '#afeeee',
  palevioletred: '#db7093', papayawhip: '#ffefd5', peachpuff: '#ffdab9',
  peru: '#cd853f', pink: '#ffc0cb', plum: '#dda0dd', powderblue: '#b0e0e6',
  purple: '#800080', rebeccapurple: '#663399', red: '#ff0000',
  rosybrown: '#bc8f8f', royalblue: '#4169e1', saddlebrown: '#8b4513',
  salmon: '#fa8072', sandybrown: '#f4a460', seagreen: '#2e8b57',
  seashell: '#fff5ee', sienna: '#a0522d', silver: '#c0c0c0',
  skyblue: '#87ceeb', slateblue: '#6a5acd', slategray: '#708090',
  slategrey: '#708090', snow: '#fffafa', springgreen: '#00ff7f',
  steelblue: '#4682b4', tan: '#d2b48c', teal: '#008080',
  thistle: '#d8bfd8', tomato: '#ff6347', turquoise: '#40e0d0',
  violet: '#ee82ee', wheat: '#f5deb3', white: '#ffffff',
  whitesmoke: '#f5f5f5', yellow: '#ffff00', yellowgreen: '#9acd32',
}

const HEX6 = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i
const HEX3 = /^#([0-9a-f])([0-9a-f])([0-9a-f])$/i
const RGB_FUNC = /^rgb\s*\(\s*(-?\d+)\s*,\s*(-?\d+)\s*,\s*(-?\d+)\s*\)$/i
const RGB_PCT = /^rgb\s*\(\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*,\s*(-?\d+(?:\.\d+)?)%\s*\)$/i

function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)))
}

/**
 * Parse a fill-color string to {r,g,b}, or null if unrecognized
 * (gradient/pattern URLs, currentColor, transparent, etc.).
 */
export function parseColorSpec(spec) {
  if (spec == null) return null
  const s = String(spec).trim().toLowerCase()
  if (!s || s === 'none' || s === 'transparent' || s.startsWith('url(') || s === 'currentcolor') {
    return null
  }
  const m6 = s.match(HEX6)
  if (m6) {
    return { r: parseInt(m6[1], 16), g: parseInt(m6[2], 16), b: parseInt(m6[3], 16) }
  }
  const m3 = s.match(HEX3)
  if (m3) {
    return {
      r: parseInt(m3[1] + m3[1], 16),
      g: parseInt(m3[2] + m3[2], 16),
      b: parseInt(m3[3] + m3[3], 16),
    }
  }
  const mr = s.match(RGB_FUNC)
  if (mr) {
    return { r: clamp255(+mr[1]), g: clamp255(+mr[2]), b: clamp255(+mr[3]) }
  }
  const mp = s.match(RGB_PCT)
  if (mp) {
    return {
      r: clamp255((+mp[1] * 255) / 100),
      g: clamp255((+mp[2] * 255) / 100),
      b: clamp255((+mp[3] * 255) / 100),
    }
  }
  if (NAMED_COLORS[s]) {
    return parseColorSpec(NAMED_COLORS[s])
  }
  return null
}

function hexOf(key) {
  return (
    '#' +
    key.r.toString(16).padStart(2, '0').toUpperCase() +
    key.g.toString(16).padStart(2, '0').toUpperCase() +
    key.b.toString(16).padStart(2, '0').toUpperCase()
  )
}

/* ---------------- Fill + transform resolution ---------------- */

function fillFromInlineStyle(styleStr) {
  if (!styleStr) return null
  const m = styleStr.match(/(?:^|;)\s*fill\s*:\s*([^;]+)/i)
  return m ? m[1].trim() : null
}

/**
 * Walk leaf → root resolving the effective fill via SVG inheritance rules.
 * Returns the unparsed color string ("none", "#XXX", "url(#g)", etc.) so
 * the caller can decide what to do (skip / parse / fall through).
 */
function resolveFill(el) {
  let cur = el
  while (cur && cur.nodeType === 1) {
    // Inline style takes precedence over presentation attribute.
    const styled = fillFromInlineStyle(cur.getAttribute('style'))
    if (styled) return styled
    const attr = cur.getAttribute('fill')
    if (attr !== null) return attr
    cur = cur.parentNode
  }
  // No fill found anywhere up the inheritance chain. SVG spec defaults
  // missing fills to black, BUT for pipeline routing we want to distinguish
  // "explicitly filled" from "merely defaulted." A path with only a stroke
  // declared via a <style> CSS class (e.g. snowflake's .cls-1) hits this
  // branch — returning null lets PreprocessPanel route it to the vector
  // stroke-to-fill path instead of treating it as a filled shape.
  return null
}

/**
 * Compose the effective transform on `el` by walking leaf → root.
 * Returns an SVG transform string ready for svgpath.transform().
 *
 * Math: when a path is wrapped as <g A><g B><path C/>, the effective transform
 * on the path's coords is A·B·C. SVG transform-list semantics apply transforms
 * right-to-left (innermost first), so the string "A B C" applies C first, then
 * B, then A — exactly the hierarchy we want. Walking leaf→root collects
 * [C, B, A]; reversing gives ["A", "B", "C"]; joining yields "A B C".
 *
 * Avoids DOMMatrix because jsdom doesn't ship it. svgpath parses SVG-spec
 * transform strings natively, so this is the cleaner path.
 */
function composeTransform(el) {
  const parts = []
  let cur = el
  while (cur && cur.nodeType === 1 && cur.getAttribute) {
    const t = cur.getAttribute('transform')
    if (t) parts.push(t.trim())
    cur = cur.parentNode
  }
  if (parts.length === 0) return ''
  return parts.reverse().join(' ')
}

/* ---------------- Shape → path-d conversion ---------------- */

function rectToD(el) {
  const x = parseFloat(el.getAttribute('x') || '0')
  const y = parseFloat(el.getAttribute('y') || '0')
  const w = parseFloat(el.getAttribute('width') || '0')
  const h = parseFloat(el.getAttribute('height') || '0')
  // rx/ry rounded corners: ignored in v1, treated as sharp.
  if (w <= 0 || h <= 0) return ''
  return `M${x},${y} h${w} v${h} h${-w} Z`
}

function circleToD(el) {
  const cx = parseFloat(el.getAttribute('cx') || '0')
  const cy = parseFloat(el.getAttribute('cy') || '0')
  const r = parseFloat(el.getAttribute('r') || '0')
  if (r <= 0) return ''
  return `M${cx - r},${cy} a${r},${r} 0 1,0 ${2 * r},0 a${r},${r} 0 1,0 ${-2 * r},0 Z`
}

function ellipseToD(el) {
  const cx = parseFloat(el.getAttribute('cx') || '0')
  const cy = parseFloat(el.getAttribute('cy') || '0')
  const rx = parseFloat(el.getAttribute('rx') || '0')
  const ry = parseFloat(el.getAttribute('ry') || '0')
  if (rx <= 0 || ry <= 0) return ''
  return `M${cx - rx},${cy} a${rx},${ry} 0 1,0 ${2 * rx},0 a${rx},${ry} 0 1,0 ${-2 * rx},0 Z`
}

function polyPointsToD(pointsAttr, closed) {
  if (!pointsAttr) return ''
  const nums = pointsAttr.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)
  if (!nums || nums.length < 4) return ''
  const cmds = []
  for (let i = 0; i + 1 < nums.length; i += 2) {
    cmds.push(`${i === 0 ? 'M' : 'L'}${nums[i]},${nums[i + 1]}`)
  }
  if (closed) cmds.push('Z')
  return cmds.join(' ')
}

function elementToD(el) {
  const tag = el.tagName.toLowerCase()
  if (tag === 'path') return el.getAttribute('d') || ''
  if (tag === 'rect') return rectToD(el)
  if (tag === 'circle') return circleToD(el)
  if (tag === 'ellipse') return ellipseToD(el)
  if (tag === 'polygon') return polyPointsToD(el.getAttribute('points'), true)
  if (tag === 'polyline') return polyPointsToD(el.getAttribute('points'), false)
  // <line> stroke-only by default — skip; it's never a filled region.
  return ''
}

const SHAPE_SELECTOR = 'path, rect, circle, ellipse, polygon, polyline'

/* ---------------- The pipeline ---------------- */

function* iterFilledShapes(doc) {
  for (const el of doc.querySelectorAll(SHAPE_SELECTOR)) {
    const fillStr = resolveFill(el)
    const key = parseColorSpec(fillStr)
    if (key === null) continue
    const rawD = elementToD(el)
    if (!rawD) continue
    const transformStr = composeTransform(el)
    const d = transformStr
      ? new SvgPath(rawD).transform(transformStr).toString()
      : rawD
    yield { element: el, key, d }
  }
}

function parseSvgDoc(svgString) {
  return new DOMParser().parseFromString(svgString, 'image/svg+xml')
}

function approxBboxArea(d) {
  const coords = d.match(/-?\d+(?:\.\d+)?(?:e[-+]?\d+)?/gi)
  if (!coords || coords.length < 4) return 0
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (let i = 0; i + 1 < coords.length; i += 2) {
    const x = parseFloat(coords[i])
    const y = parseFloat(coords[i + 1])
    if (x < minX) minX = x; if (x > maxX) maxX = x
    if (y < minY) minY = y; if (y > maxY) maxY = y
  }
  return Math.max(0, (maxX - minX) * (maxY - minY))
}

/**
 * @param {string} svgString
 * @returns {{hex: string, nPaths: number, bboxArea: number}[]} ranked by summed bbox area, desc
 */
export function listColors(svgString) {
  const doc = parseSvgDoc(svgString)
  const accum = new Map()
  for (const { key, d } of iterFilledShapes(doc)) {
    const hex = hexOf(key)
    const area = approxBboxArea(d)
    const prev = accum.get(hex)
    if (prev) {
      prev.nPaths += 1
      prev.bboxArea += area
    } else {
      accum.set(hex, { hex, nPaths: 1, bboxArea: area })
    }
  }
  return [...accum.values()].sort((a, b) => b.bboxArea - a.bboxArea)
}

function resolveViewBox(root) {
  const vbAttr = root.getAttribute('viewBox')
  if (vbAttr) {
    const parts = vbAttr.trim().split(/[\s,]+/).map(Number)
    if (parts.length === 4 && parts.every(Number.isFinite)) {
      return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] }
    }
  }
  const w = parseFloat(root.getAttribute('width') || '0')
  const h = parseFloat(root.getAttribute('height') || '0')
  if (w > 0 && h > 0) return { x: 0, y: 0, w, h }
  // Fallback: union of element bboxes (rare; design exports always have viewBox or width/height).
  return { x: 0, y: 0, w: 0, h: 0 }
}

/**
 * Select shapes by fill color, emit a black SVG.
 * @param {string} svgString
 * @param {{colors: string[], tolerance?: number, invert?: boolean}} opts
 * @returns {{svg: string, kept: number}}
 */
export function selectByColor(svgString, opts) {
  const { colors, tolerance = 0, invert = false } = opts
  const targets = colors
    .map(parseColorSpec)
    .filter((c) => c !== null)
  if (targets.length === 0 && !invert) {
    return {
      svg: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0"></svg>\n`,
      kept: 0,
    }
  }

  const doc = parseSvgDoc(svgString)
  const vb = resolveViewBox(doc.documentElement)

  const dStrings = []
  for (const { key, d } of iterFilledShapes(doc)) {
    const hit = targets.some(
      (t) =>
        Math.max(
          Math.abs(key.r - t.r),
          Math.abs(key.g - t.g),
          Math.abs(key.b - t.b)
        ) <= tolerance
    )
    if (hit === invert) continue
    dStrings.push(d)
  }

  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${vb.w}" height="${vb.h}" viewBox="${vb.x} ${vb.y} ${vb.w} ${vb.h}">\n`,
  ]
  for (const d of dStrings) {
    parts.push(`  <path d="${d}" fill="#000000" fill-rule="evenodd"/>\n`)
  }
  parts.push('</svg>\n')
  return { svg: parts.join(''), kept: dStrings.length }
}
