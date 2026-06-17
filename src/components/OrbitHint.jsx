import { useEffect, useRef, useState } from 'react'
import './OrbitHint.css'

/**
 * OrbitHint — bottom-center nudge telling the visitor the preview is a real
 * 3D view they can spin, not a flat head-on render. Without this, people
 * assume the reflection only looks the way it does straight-on and never
 * discover that dragging reveals how the tunnel of reflections actually
 * recedes.
 *
 * Shows on every load (the discovery matters more than the mild repeat) and
 * fades out the moment the user drags inside the canvas, or after a timeout
 * if they never do. `pointer-events: none` so it never eats the very drag
 * it's asking for.
 */
const AUTO_HIDE_MS = 9000

export default function OrbitHint() {
  const [visible, setVisible] = useState(true)
  const hideTimer = useRef(null)

  useEffect(() => {
    // Dismiss on the first real drag anywhere in the canvas. The Three.js
    // canvas captures pointer events for OrbitControls, so listen on the
    // window in the capture phase to see it regardless.
    const dismiss = () => setVisible(false)
    window.addEventListener('pointerdown', dismiss, { capture: true, once: true })
    hideTimer.current = setTimeout(dismiss, AUTO_HIDE_MS)
    return () => {
      window.removeEventListener('pointerdown', dismiss, { capture: true })
      clearTimeout(hideTimer.current)
    }
  }, [])

  return (
    <div className={`orbit-hint ${visible ? '' : 'orbit-hint--hidden'}`} aria-hidden="true">
      <svg
        className="orbit-hint__icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* orbit ring + a draggable handle sweeping across it */}
        <ellipse cx="12" cy="12" rx="9" ry="4.5" />
        <path d="M5 8.5 A9 4.5 0 0 0 19 15.5" opacity="0.45" />
        <circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none" />
        <path d="M3.5 12 L1.5 12 M22.5 12 L20.5 12" opacity="0.7" />
      </svg>
      <span className="orbit-hint__text">
        Click and drag to orbit — see how the reflection <em>really</em> recedes
      </span>
    </div>
  )
}
