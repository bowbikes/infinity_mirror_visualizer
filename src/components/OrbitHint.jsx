import { useEffect, useRef, useState } from 'react'
import './OrbitHint.css'

/**
 * OrbitHint, bottom-center note telling the visitor the preview is a real
 * 3D view they can take hold of, not a flat render.
 *
 * The page now opens with the camera already orbiting, so the motion itself
 * shows that the reflection has depth. What the note has to say changed with
 * that: while the camera is moving on its own it says the scene can be
 * grabbed; once it is still it says dragging orbits it.
 *
 * Shows on every load and fades out the moment the user presses anywhere, or
 * after a timeout if they never do. `pointer-events: none` so it never eats
 * the very drag it is asking for.
 */
const AUTO_HIDE_MS = 9000

export default function OrbitHint({ orbiting = false }) {
  const [visible, setVisible] = useState(true)
  const hideTimer = useRef(null)

  useEffect(() => {
    // Dismiss on the first real press anywhere. The Three.js canvas captures
    // pointer events for OrbitControls, so listen on the window in the
    // capture phase to see it regardless.
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
      </svg>
      <span className="orbit-hint__text">
        {orbiting
          ? 'Drag the mirror to take over the camera'
          : 'Drag the mirror to orbit and see how far the reflection goes'}
      </span>
    </div>
  )
}
