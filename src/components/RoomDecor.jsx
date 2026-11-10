import { useMemo } from 'react'
import * as THREE from 'three'
import { SoftShadow, useDisposable } from './Wall'

/**
 * RoomDecor: a shelf under the mirror and two small framed pieces beside it.
 * Their job is scale and context, nothing more. Someone designing their own
 * mirror is trying to picture their own wall, so everything here stays quiet:
 *
 * - Every colour is mixed from the wall colour the visitor picked. Nothing
 *   has a hue of its own, so nothing can clash and nothing competes with the
 *   one lit thing in the scene.
 * - Sizes are real ones, because scale is the point: the larger frame is A5
 *   (148 x 210 mm), the books are a paperback's footprint.
 * - Positions follow the mirror, so a 600 mm mirror pushes its neighbours
 *   out of the way the same as a 300 mm one.
 *
 * Switchable from the panel ("Room"), for a clean product view.
 *
 * Scale: 1 unit = 10 mm, wall plane at z = 0.
 */

const INK = new THREE.Color('#1b1b1f')
const WHITE = new THREE.Color('#ffffff')

/**
 * The room's palette: the wall colour mixed a little way toward graphite or
 * toward white. Which way depends on the wall. On a light wall things step
 * darker; on a dark wall they step lighter, and by less, because a picture
 * mat mixed halfway to white on a navy wall would be the brightest thing in
 * the scene. Mixing with a neutral also keeps the decor from out-colouring
 * the wall (changing lightness alone turned a cream wall's shelf mustard).
 */
function roomPalette(wallColor) {
  const wall = new THREE.Color(wallColor)
  const hsl = { h: 0, s: 0, l: 0 }
  wall.getHSL(hsl)
  const dark = hsl.l < 0.45
  const hex = (c) => '#' + c.getHexString()
  // (toward ink on a light wall, toward white on a dark wall)
  const step = (onLight, onDark) => hex(wall.clone().lerp(dark ? WHITE : INK, dark ? onDark : onLight))
  const mat = wall.clone().lerp(WHITE, dark ? 0.12 : 0.5)
  return {
    mat: hex(mat),
    line: hex(mat.clone().lerp(dark ? WHITE : INK, dark ? 0.32 : 0.3)),
    border: step(0.55, 0.2),
    shelf: step(0.42, 0.1),
    bookA: step(0.26, 0.16),
    bookB: step(0.12, 0.06),
    vase: step(0.18, 0.22),
  }
}

/** The picture inside a frame: a pale mat with a few quiet lines on it. */
function makeArtTexture(kind, mat, ink) {
  const c = document.createElement('canvas')
  const W = (c.width = 256)
  const H = (c.height = kind === 'hills' ? 360 : 256)
  const g = c.getContext('2d')
  g.fillStyle = mat
  g.fillRect(0, 0, W, H)
  g.strokeStyle = ink
  g.lineWidth = 3
  g.lineJoin = 'round'
  if (kind === 'hills') {
    // three ridgelines and a low sun
    g.beginPath()
    g.arc(W * 0.68, H * 0.3, 20, 0, Math.PI * 2)
    g.stroke()
    for (let i = 0; i < 3; i++) {
      const y = H * (0.5 + i * 0.13)
      g.beginPath()
      g.moveTo(34, y + 26)
      g.bezierCurveTo(W * 0.3, y - 40 + i * 14, W * 0.52, y + 34 - i * 10, W - 34, y - 12 + i * 8)
      g.stroke()
    }
  } else {
    // nested hexagons: a small nod to what hangs next to it
    for (let i = 0; i < 3; i++) {
      const r = 78 - i * 22
      g.beginPath()
      for (let k = 0; k < 6; k++) {
        const a = (Math.PI / 3) * k + Math.PI / 6
        const x = W / 2 + r * Math.cos(a)
        const y = H / 2 + r * Math.sin(a)
        if (k === 0) g.moveTo(x, y)
        else g.lineTo(x, y)
      }
      g.closePath()
      g.stroke()
    }
  }
  const t = new THREE.CanvasTexture(c)
  t.colorSpace = THREE.SRGBColorSpace
  return t
}

function Picture({ x, y, w, h, kind, palette }) {
  const { mat, line, border } = palette
  const art = useDisposable(() => makeArtTexture(kind, mat, line), [kind, mat, line])
  const BORDER = 0.7
  const DEPTH = 0.9
  return (
    <group position={[x, y, 0]}>
      <SoftShadow w={w} h={h} pad={3.5} blur={1.6} alpha={0.3} drop={0.7} />
      <mesh position={[0, 0, DEPTH / 2]}>
        <boxGeometry args={[w, h, DEPTH]} />
        <meshStandardMaterial color={border} roughness={0.8} metalness={0.05} />
      </mesh>
      <mesh position={[0, 0, DEPTH + 0.01]}>
        <planeGeometry args={[w - BORDER * 2, h - BORDER * 2]} />
        <meshStandardMaterial map={art} roughness={0.95} metalness={0} />
      </mesh>
    </group>
  )
}

export default function RoomDecor({ frameWidthUnits, frameHeightUnits, wallColor }) {
  const colors = useMemo(() => roomPalette(wallColor), [wallColor])

  // Shelf: 110 mm below the frame, 110 mm deep, a little wider than the mirror.
  const GAP = 11
  const SHELF_T = 1.6
  const SHELF_D = 11
  const shelfW = Math.max(frameWidthUnits * 1.5, 42)
  const shelfTop = -(frameHeightUnits / 2 + GAP)
  const shelfY = shelfTop - SHELF_T / 2

  // Pictures hang to the right of the mirror, top edges near its top third.
  const picLeft = frameWidthUnits / 2 + 9
  const A5 = { w: 14.8, h: 21 }
  const SMALL = { w: 10, h: 10 }
  const a5Y = frameHeightUnits / 2 - 4 - A5.h / 2
  const smallY = a5Y - A5.h / 2 - 3 - SMALL.h / 2

  return (
    <group>
      {/* shelf */}
      <SoftShadow w={shelfW} h={SHELF_T + 2.5} x={0} y={shelfY - 1.6} pad={5} blur={2.6} alpha={0.34} drop={0.6} />
      <mesh position={[0, shelfY, SHELF_D / 2]}>
        <boxGeometry args={[shelfW, SHELF_T, SHELF_D]} />
        <meshStandardMaterial color={colors.shelf} roughness={0.75} metalness={0.05} />
      </mesh>

      {/* two paperbacks lying flat, left end */}
      <mesh position={[-shelfW / 2 + 12, shelfTop + 1.1, SHELF_D / 2]} rotation={[0, 0.08, 0]}>
        <boxGeometry args={[19, 2.2, 9]} />
        <meshStandardMaterial color={colors.bookA} roughness={0.9} />
      </mesh>
      <mesh position={[-shelfW / 2 + 11.2, shelfTop + 3.1, SHELF_D / 2]} rotation={[0, -0.06, 0]}>
        <boxGeometry args={[17.5, 1.8, 8.6]} />
        <meshStandardMaterial color={colors.bookB} roughness={0.9} />
      </mesh>

      {/* a small vase, right end */}
      <mesh position={[shelfW / 2 - 6, shelfTop + 4, SHELF_D / 2]}>
        <cylinderGeometry args={[1.7, 2.9, 8, 28]} />
        <meshStandardMaterial color={colors.vase} roughness={0.6} metalness={0.05} />
      </mesh>

      {/* pictures */}
      <Picture x={picLeft + A5.w / 2} y={a5Y} w={A5.w} h={A5.h} kind="hills" palette={colors} />
      <Picture x={picLeft + SMALL.w / 2} y={smallY} w={SMALL.w} h={SMALL.h} kind="hex" palette={colors} />
    </group>
  )
}
