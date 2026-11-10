import { useEffect, useState } from 'react'
import './InfoPopover.css'

/**
 * InfoPopover, top-left "what is this" sheet.
 *
 * Shown by default on a first visit at desktop widths. Once the user closes
 * it, the dismissal sticks via localStorage and a small button takes its
 * place so they can reopen it at any time.
 *
 * On narrow screens it starts closed: the sheet used to cover the top third
 * of a phone, including the mirror itself and the drawer button.
 *
 * Storage is wrapped in try/catch. This app runs inside a cross-origin frame
 * on billwhite.me, and a browser that blocks third-party storage throws on
 * the first touch of localStorage. Unguarded, that throw inside an effect
 * takes the whole React tree down with it.
 */
const STORAGE_KEY = 'imv:info-dismissed'
const NARROW_PX = 900

function wasDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export default function InfoPopover() {
  const [open, setOpen] = useState(false)

  // Honor a stored dismissal on mount. Defaulting `open` to false avoids
  // a flash of the card on returning visits before the effect runs.
  useEffect(() => {
    const narrow = typeof window !== 'undefined' && window.innerWidth < NARROW_PX
    if (!narrow && !wasDismissed()) setOpen(true)
  }, [])

  const dismiss = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, '1')
    } catch {}
    setOpen(false)
  }

  if (!open) {
    return (
      <button
        type="button"
        className="info-reopen"
        onClick={() => setOpen(true)}
        aria-label="About this tool"
        title="About this tool"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="11" x2="12" y2="16" />
          <circle cx="12" cy="7.5" r="1" fill="currentColor" stroke="none" />
        </svg>
      </button>
    )
  }

  return (
    <div className="info-card" role="dialog" aria-label="About this tool">
      <div className="info-header">
        <div>
          <span className="info-eyebrow">Layered Logic</span>
          <h2 className="info-title">Mirror visualizer</h2>
        </div>
        <button
          type="button"
          className="info-close"
          onClick={dismiss}
          aria-label="Dismiss"
        >
          ×
        </button>
      </div>
      <p className="info-body">
        Design an infinity mirror before it is made. The preview is a real 3D
        view: drag it to look down the tunnel of reflections.
      </p>
      <ul className="info-howto">
        <li>
          <strong>Icon</strong>
          <span>Pick a preset shape, or choose Custom Upload to bring your own art.</span>
        </li>
        <li>
          <strong>Colors</strong>
          <span>Wall, frame and light, plus how bright the light runs.</span>
        </li>
        <li>
          <strong>Frame</strong>
          <span>Width, height, depth and how many reflections to draw.</span>
        </li>
        <li>
          <strong>Export</strong>
          <span>Download the design bundle, or copy a link that restores it.</span>
        </li>
      </ul>
      <div className="info-brand">
        Built by{' '}
        <a
          href="https://layeredlogic.cc"
          target="_blank"
          rel="noopener noreferrer"
          className="info-brand-link"
        >
          Layered Logic
        </a>
      </div>
    </div>
  )
}
