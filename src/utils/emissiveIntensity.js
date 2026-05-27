import * as THREE from 'three'

/**
 * Compute the bloom-friendly emissive intensity for a given hex color.
 *
 * Background: LEDs of equal physical brightness don't *look* equally bright
 * to the eye — yellows and greens (around 60° hue) appear punchier than
 * blues/purples (around 240°). This function fudges the emissive multiplier
 * by hue so different colors land at a similar perceived brightness in
 * the rendered scene.
 *
 * Shaping is a sum of three gaussians over hue distance:
 *   - peak around hue 240°  (boost blues — they look dim otherwise)
 *   - dip  around hue 60°   (yellows already pop, tone them down)
 *   - red-lift around hue 0° (reds need a small lift to read consistently)
 * Plus a piecewise lightness adjustment for very dark / very light inputs.
 *
 * All the constants were hand-tuned against the bloom pipeline; bundling
 * them here so the SvgIcon body stays readable.
 */

// Scratch instances to avoid per-call allocation. Single-threaded React.
const _color = new THREE.Color()
const _hsl = { h: 0, s: 0, l: 0 }

const INTENSITY_FACTOR = 0.8
const MIN_INTENSITY = 2.5

const PEAK_BOOST = 9.0
const PEAK_SIGMA_DEG = 40.0

const DIP_BOOST = 1.4
const DIP_SIGMA_DEG = 35.0

const RED_LIFT_BOOST = 1.75
const RED_LIFT_SIGMA_DEG = 55.0

const DARK_BOOST = 16.67
const LIGHT_REDUCE = 0.88

function circularHueDistance(a, b) {
  const d = Math.abs(a - b)
  return Math.min(d, 360 - d)
}

function gaussian(dist, sigma) {
  const x = dist / sigma
  return Math.exp(-0.5 * x * x)
}

export function computeEmissiveIntensity(color) {
  _color.set(color).getHSL(_hsl)

  const hueDeg = (((_hsl.h * 360) % 360) + 360) % 360

  const peak = PEAK_BOOST * gaussian(circularHueDistance(hueDeg, 240), PEAK_SIGMA_DEG)
  const dip = DIP_BOOST * gaussian(circularHueDistance(hueDeg, 60), DIP_SIGMA_DEG)
  const redLift = RED_LIFT_BOOST * gaussian(circularHueDistance(hueDeg, 0), RED_LIFT_SIGMA_DEG)

  let intensity = MIN_INTENSITY + peak + redLift - dip

  if (_hsl.l < 0.3) {
    intensity += (0.3 - _hsl.l) * DARK_BOOST
  } else if (_hsl.l > 0.7) {
    intensity *= LIGHT_REDUCE
  }

  return Math.max(0, intensity) * INTENSITY_FACTOR
}
