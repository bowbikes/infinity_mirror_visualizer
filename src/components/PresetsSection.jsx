import { useEffect, useState } from 'react'

/**
 * PresetsSection — name-able localStorage-backed configuration snapshots.
 *
 * Builds on the URL-hash share mechanism: the "config" passed in/out is
 * the same SHARED_KEYS subset that #cfg= encodes. So a saved preset is
 * effectively a named bookmark stored locally. Save → reads parent's
 * current config, prompts for a name. Load → applies one back via the
 * parent's applyConfig callback. Delete → removes from the list.
 *
 * Custom-art SVGs are NOT included (same reason as the share link —
 * they can be huge and re-upload is fast).
 */
const STORAGE_KEY = 'imv:presets'

function loadStored() {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persistStored(presets) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(presets))
    return true
  } catch {
    return false
  }
}

export default function PresetsSection({ currentConfig, onApplyConfig }) {
  const [presets, setPresets] = useState(loadStored)
  // 'idle' | 'naming' — when naming, the input box is shown instead of
  // the Save button. Lets us avoid window.prompt (which is jarring,
  // strips formatting, blocks the page).
  const [stage, setStage] = useState('idle')
  const [draftName, setDraftName] = useState('')

  // Resync from storage on focus — if the user has the app open in two
  // tabs and saves in one, the other tab sees the new preset next time
  // they tab back. Cheap, fires rarely.
  useEffect(() => {
    const onFocus = () => setPresets(loadStored())
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  const commitSave = () => {
    const name = draftName.trim()
    if (!name) {
      setStage('idle')
      return
    }
    const existingIdx = presets.findIndex((p) => p.name === name)
    const entry = { name, cfg: currentConfig, savedAt: Date.now() }
    const next =
      existingIdx >= 0
        ? presets.map((p, i) => (i === existingIdx ? entry : p))
        : [...presets, entry]
    if (persistStored(next)) {
      setPresets(next)
    }
    setDraftName('')
    setStage('idle')
  }

  const handleDelete = (name) => {
    const next = presets.filter((p) => p.name !== name)
    persistStored(next)
    setPresets(next)
  }

  return (
    <div style={styles.section}>
      <h3 style={styles.sectionTitle}>Presets</h3>

      {stage === 'idle' ? (
        <button
          type="button"
          onClick={() => setStage('naming')}
          style={styles.saveButton}
          title="Save the current configuration as a named preset in this browser."
        >
          Save current as preset…
        </button>
      ) : (
        <div style={styles.nameRow}>
          <input
            type="text"
            value={draftName}
            onChange={(e) => setDraftName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitSave()
              if (e.key === 'Escape') {
                setDraftName('')
                setStage('idle')
              }
            }}
            placeholder="Preset name"
            autoFocus
            style={styles.nameInput}
          />
          <button
            type="button"
            onClick={commitSave}
            style={styles.confirmButton}
          >
            Save
          </button>
        </div>
      )}

      {presets.length > 0 && (
        <ul style={styles.list}>
          {presets.map((p) => (
            <li key={p.name} style={styles.listItem}>
              <button
                type="button"
                onClick={() => onApplyConfig(p.cfg)}
                style={styles.applyButton}
                title={`Saved ${new Date(p.savedAt).toLocaleString()}`}
              >
                {p.name}
              </button>
              <button
                type="button"
                onClick={() => handleDelete(p.name)}
                style={styles.deleteButton}
                title={`Delete "${p.name}"`}
                aria-label={`Delete preset ${p.name}`}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const styles = {
  section: {
    marginBottom: '24px',
    paddingBottom: '16px',
    borderBottom: '1px solid #333',
  },
  sectionTitle: {
    margin: '0 0 12px 0',
    fontSize: '14px',
    fontWeight: 600,
    textTransform: 'uppercase',
    color: '#999',
  },
  saveButton: {
    width: '100%',
    padding: '8px',
    fontSize: '12px',
    backgroundColor: 'transparent',
    color: '#ccc',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#555',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  nameRow: {
    display: 'flex',
    gap: '6px',
  },
  nameInput: {
    flex: 1,
    padding: '6px 8px',
    fontSize: '12px',
    backgroundColor: '#2a2a2a',
    color: '#fff',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    fontFamily: 'inherit',
  },
  confirmButton: {
    padding: '6px 12px',
    fontSize: '12px',
    backgroundColor: '#00ffff',
    color: '#000',
    border: 'none',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontWeight: 600,
  },
  list: {
    listStyle: 'none',
    margin: '10px 0 0 0',
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  listItem: {
    display: 'flex',
    gap: '4px',
  },
  applyButton: {
    flex: 1,
    padding: '6px 10px',
    fontSize: '12px',
    backgroundColor: '#2a2a2a',
    color: '#ccc',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    textAlign: 'left',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  deleteButton: {
    width: '28px',
    padding: '4px',
    fontSize: '14px',
    backgroundColor: 'transparent',
    color: '#777',
    borderWidth: '1px',
    borderStyle: 'solid',
    borderColor: '#444',
    borderRadius: '4px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    flexShrink: 0,
  },
}
