import { useEffect, useState } from 'react'
import './InfoPopover.css'

/**
 * InfoPopover — top-left "what is this" card.
 *
 * Shown by default on first visit. Once the user closes it, the
 * dismissal sticks via localStorage and a small ⓘ button takes its
 * place so they can reopen at any time.
 */
const STORAGE_KEY = 'imv:info-dismissed'

export default function InfoPopover() {
  const [open, setOpen] = useState(false)

  // Honor a stored dismissal on mount. Defaulting `open` to false avoids
  // a flash of the card on returning visits before the effect runs.
  useEffect(() => {
    const dismissed =
      typeof window !== 'undefined' &&
      window.localStorage.getItem(STORAGE_KEY) === '1'
    if (!dismissed) setOpen(true)
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
        ⓘ
      </button>
    )
  }

  return (
    <div className="info-card" role="dialog" aria-label="About this tool">
      <div className="info-header">
        <h2 className="info-title">Infinity Mirror Configurator</h2>
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
        Design an infinity mirror before it's manufactured. Pick a preset
        shape or upload your own black-and-white art, tune the frame
        dimensions, colors, and light intensity, then export the config or
        share a link.
      </p>
      <ul className="info-howto">
        <li>
          <strong>Icon</strong> — pick a preset or <em>Custom Upload</em>{' '}
          to bring in your own art.
        </li>
        <li>
          <strong>Colors</strong> — set the light hue and overall intensity.
        </li>
        <li>
          <strong>Frame</strong> — width, height, depth, and reflection
          layers.
        </li>
        <li>
          <strong>Export</strong> — download the config bundle or copy a
          shareable URL.
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
        <span className="info-tagline"> — light that layers.</span>
      </div>
    </div>
  )
}
