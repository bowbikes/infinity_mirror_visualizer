import { useEffect, useState } from 'react'

import PreprocessPanel from './PreprocessPanel'
import './ExportModal.css'

/**
 * CustomArtModal — wizard wrapper around PreprocessPanel.
 *
 * The actual upload / color-pick / manufacturability state machine lives
 * inside PreprocessPanel. This component just gives it a larger surface
 * (a modal) so the sidebar can stay compact.
 *
 * The modal mounts once on first open and then stays mounted (hidden via
 * CSS) so PreprocessPanel state — uploaded file, picked colors, slider
 * positions — persists across closes. Hit Edit again and you're back
 * where you left off without re-uploading. Every change in the modal is
 * live (no Cancel — use the Replace flow to start over).
 */
export default function CustomArtModal({
  isOpen,
  onClose,
  onPreprocessed,
  onFileNameChange,
  onError,
}) {
  const [hasOpenedOnce, setHasOpenedOnce] = useState(false)
  useEffect(() => {
    if (isOpen) setHasOpenedOnce(true)
  }, [isOpen])
  if (!hasOpenedOnce) return null
  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{ display: isOpen ? 'flex' : 'none' }}
    >
      <div
        className="modal-content"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: 520 }}
      >
        <div className="modal-header">
          <h2>Custom Art</h2>
          <button
            type="button"
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <div className="modal-body">
          <PreprocessPanel
            onPreprocessed={onPreprocessed}
            onFileNameChange={onFileNameChange}
            onError={onError}
          />
        </div>
        <div className="modal-footer">
          <button
            type="button"
            className="button-primary"
            onClick={onClose}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
