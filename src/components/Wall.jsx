import { useEffect, useMemo } from 'react'
import * as THREE from 'three'

/**
 * Wall: the surface the mirror hangs on, plus the things that make it read
 * as a wall and not a plane floating in space.
 *
 * 1. One seamless surface. It used to be four rectangles butted around the
 *    mirror opening, and hairline gaps showed where they met. It is a single
 *    shape with a hole now. The hole has to stay: the reflection layers are
 *    drawn behind the wall plane, through the frame.
 * 2. A gentle light falloff toward the edges, so the surface has a middle.
 * 3. A soft shadow where the frame meets the wall, so the frame stops
 *    floating. The lights sit above the mirror, so the shadow falls slightly
 *    downward.
 *
 * Shadows here are painted textures, not real shadow maps: the scene is
 * otherwise unlit-cheap and has to stay smooth on a mid-range phone.
 *
 * Scale: 1 unit = 10 mm, wall plane at z = 0.
 */

export const WALL_MARGIN = 70 // units of wall beyond the frame on every side

function rect(target, w, h, cx = 0, cy = 0) {
  target.moveTo(cx - w / 2, cy - h / 2)
  target.lineTo(cx + w / 2, cy - h / 2)
  target.lineTo(cx + w / 2, cy + h / 2)
  target.lineTo(cx - w / 2, cy + h / 2)
  target.closePath()
  return target
}

/** A rectangle with a rectangular hole, as one geometry. UVs are raw x/y. */
function holedRectGeometry(outerW, outerH, holeW, holeH, outerCy = 0) {
  const shape = rect(new THREE.Shape(), outerW, outerH, 0, outerCy)
  shape.holes.push(rect(new THREE.Path(), holeW, holeH))
  return new THREE.ShapeGeometry(shape)
}

/** White in the middle, a little darker at the edges. Multiplies the wall colour. */
function makeFalloffTexture() {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const g = c.getContext('2d')
  // centred slightly above the middle: the light comes from above
  const grad = g.createRadialGradient(128, 108, 16, 128, 128, 200)
  grad.addColorStop(0, '#ffffff')
  grad.addColorStop(0.5, '#f1f1f1')
  grad.addColorStop(1, '#c9c9c9')
  g.fillStyle = grad
  g.fillRect(0, 0, 256, 256)
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

/**
 * A blurred black rectangle on a transparent canvas: the shadow of a w x h
 * object, with `pad` units of room around it for the blur to fade out in.
 * Drawn with canvas shadowBlur (the rectangle itself is parked off-canvas and
 * only its shadow lands), because ctx.filter is not available in Safari.
 */
export function makeShadowTexture(w, h, pad, blur, alpha) {
  const fullW = w + pad * 2
  const fullH = h + pad * 2
  const ppu = Math.min(8, 512 / Math.max(fullW, fullH))
  const c = document.createElement('canvas')
  c.width = Math.max(2, Math.ceil(fullW * ppu))
  c.height = Math.max(2, Math.ceil(fullH * ppu))
  const g = c.getContext('2d')
  const park = c.width * 2
  g.shadowColor = `rgba(0, 0, 0, ${alpha})`
  g.shadowBlur = blur * ppu
  g.shadowOffsetX = park
  g.fillStyle = '#000'
  g.fillRect(pad * ppu - park, pad * ppu, w * ppu, h * ppu)
  return new THREE.CanvasTexture(c)
}

/** Dispose GPU resources when they are replaced or the component unmounts. */
export function useDisposable(factory, deps) {
  const value = useMemo(factory, deps) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => value.dispose?.(), [value])
  return value
}

/**
 * A soft shadow on the wall behind something flat (a shelf, a picture frame).
 * The object in front hides the middle, so this is a plain quad.
 */
export function SoftShadow({ w, h, x = 0, y = 0, z = 0.03, pad = 4, blur = 2.2, alpha = 0.3, drop = 0.9 }) {
  const texture = useDisposable(() => makeShadowTexture(w, h, pad, blur, alpha), [w, h, pad, blur, alpha])
  return (
    <mesh position={[x, y - drop, z]} renderOrder={1}>
      <planeGeometry args={[w + pad * 2, h + pad * 2]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} toneMapped={false} />
    </mesh>
  )
}

export default function Wall({ frameWidthUnits, frameHeightUnits, wallColor }) {
  const wallW = frameWidthUnits + WALL_MARGIN * 2
  const wallH = frameHeightUnits + WALL_MARGIN * 2

  const wallGeometry = useDisposable(
    () => holedRectGeometry(wallW, wallH, frameWidthUnits, frameHeightUnits),
    [wallW, wallH, frameWidthUnits, frameHeightUnits]
  )

  const falloff = useDisposable(makeFalloffTexture, [])
  // ShapeGeometry UVs are the raw x/y of each vertex, centred on the origin.
  // Scale and shift them so the texture spans the whole wall once.
  falloff.repeat.set(1 / wallW, 1 / wallH)
  falloff.offset.set(0.5, 0.5)

  // Frame shadow: a ring around the frame's footprint. It needs the same hole
  // as the wall, or it would sit in front of the reflections behind it.
  const PAD = 7
  const DROP = 1.3
  const shadowW = frameWidthUnits + PAD * 2
  const shadowH = frameHeightUnits + PAD * 2
  const shadowGeometry = useDisposable(
    () => holedRectGeometry(shadowW, shadowH, frameWidthUnits, frameHeightUnits, -DROP),
    [shadowW, shadowH, frameWidthUnits, frameHeightUnits]
  )
  const shadowTexture = useDisposable(
    () => makeShadowTexture(frameWidthUnits, frameHeightUnits, PAD, 3.2, 0.42),
    [frameWidthUnits, frameHeightUnits]
  )
  shadowTexture.repeat.set(1 / shadowW, 1 / shadowH)
  shadowTexture.offset.set(0.5, 0.5 + DROP / shadowH)

  return (
    <>
      <mesh geometry={wallGeometry}>
        <meshStandardMaterial color={wallColor} map={falloff} roughness={0.9} metalness={0.1} />
      </mesh>
      <mesh geometry={shadowGeometry} position={[0, 0, 0.02]} renderOrder={1}>
        <meshBasicMaterial map={shadowTexture} transparent depthWrite={false} toneMapped={false} />
      </mesh>
    </>
  )
}
