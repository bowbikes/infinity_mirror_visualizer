/**
 * Anonymous design telemetry: which designs people settle on, save, share,
 * export or order, so the Layered Logic product line can follow what people
 * actually make (the weekly design-trends digest reads this).
 *
 * What is sent: the design settings, whether custom art is in use and its
 * size in KB, a random id that lives only for this page load, and which site
 * framed the app. Never the art itself, preset names, or anything typed into
 * the order form. Visitors with Global Privacy Control or Do Not Track on
 * send nothing.
 *
 * Fire and forget: text/plain JSON (a CORS "simple" request, no preflight),
 * keepalive so it survives a tab close, errors swallowed. A design is sent at
 * most once per event type per page load, and at most MAX_EVENTS in total.
 */

const ENDPOINT =
  import.meta.env.VITE_DESIGN_EVENT_ENDPOINT || 'https://n8n.billwhitedesign.com/webhook/design-event'

const MAX_EVENTS = 40

// Per page load, never stored: a reload is a new session.
const SID = Array.from({ length: 16 }, () => Math.floor(Math.random() * 36).toString(36)).join('')

const sent = new Set()
let count = 0

function optedOut() {
  if (typeof navigator === 'undefined') return true
  return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1'
}

function embeddingSite() {
  try {
    return document.referrer ? new URL(document.referrer).origin : ''
  } catch {
    return ''
  }
}

/** Drop UI-only preferences so equal designs hash equal. */
export function designOnly(config) {
  // eslint-disable-next-line no-unused-vars
  const { autoOrbit, ...rest } = config
  return rest
}

/**
 * @param {'settle'|'save_preset'|'share_link'|'export'|'order'|'art_upload'} event
 * @param {object} config  the shareable config (buildCurrentConfig shape)
 * @param {{used: boolean, kb?: number}} art
 */
export function recordDesign(event, config, art = { used: false }) {
  if (import.meta.env.MODE === 'test' || optedOut()) return
  const design = designOnly(config)
  const key = `${event}|${JSON.stringify(design)}`
  if (sent.has(key) || count >= MAX_EVENTS) return
  sent.add(key)
  count += 1
  try {
    fetch(ENDPOINT, {
      method: 'POST',
      mode: 'cors',
      keepalive: true,
      headers: { 'Content-Type': 'text/plain;charset=UTF-8' },
      body: JSON.stringify({
        product: 'mirror',
        event,
        sid: SID,
        config: design,
        art,
        source: embeddingSite(),
      }),
    }).catch(() => {})
  } catch {
    // Telemetry must never break the app.
  }
}
