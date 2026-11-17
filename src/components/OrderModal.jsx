import { useEffect, useRef, useState } from 'react';
import './ExportModal.css';
import './OrderModal.css';

/**
 * "Order this design": the handoff from the visualizer to the Layered Logic
 * shop. The design goes to Bill (via an n8n webhook) as the same ZIP the
 * Export button builds; he checks it can be cut, then sends a Shopify invoice
 * from layeredlogic.cc. Nothing is charged here, and the copy says so,
 * because a custom piece can be unbuildable and nobody should pay for that.
 *
 * Owns only the form and its three states (form, sending, sent). Building and
 * sending the ZIP is the parent's onSubmit, which resolves to
 * { ok, ref } or { ok: false, error } and never throws.
 */

const SHOP_URL = 'https://layeredlogic.cc';

function inches(mm) {
  return Math.round((mm / 25.4) * 10) / 10;
}

export default function OrderModal({ isOpen, onClose, onSubmit, summary }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [notes, setNotes] = useState('');
  // Honeypot: real people never see or fill it.
  const [company, setCompany] = useState('');
  const [status, setStatus] = useState('idle'); // idle | sending | sent
  const [error, setError] = useState('');
  const [ref, setRef] = useState('');
  const nameRef = useRef(null);

  // Fresh form each time it opens, but keep name/email typed earlier in the
  // session so a second order doesn't mean retyping them.
  useEffect(() => {
    if (!isOpen) return;
    setStatus('idle');
    setError('');
    setRef('');
    setCompany('');
    const t = setTimeout(() => nameRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e) => {
      if (e.key === 'Escape' && status !== 'sending') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, status, onClose]);

  if (!isOpen) return null;

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const canSend = name.trim() && emailOk && status !== 'sending';

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!canSend) return;
    setStatus('sending');
    setError('');
    const result = await onSubmit({
      name: name.trim(),
      email: email.trim(),
      notes: notes.trim(),
      company,
    });
    if (result.ok) {
      setRef(result.ref);
      setStatus('sent');
    } else {
      setError(result.error);
      setStatus('idle');
    }
  };

  const sizeLabel = summary
    ? `${inches(summary.widthMm)} x ${inches(summary.heightMm)} in`
    : '';

  return (
    <div className="modal-overlay" onClick={status === 'sending' ? undefined : onClose}>
      <div
        className="modal-content order-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="order-modal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 id="order-modal-title">{status === 'sent' ? 'Design sent' : 'Order this design'}</h2>
          <button
            className="close-button"
            onClick={onClose}
            disabled={status === 'sending'}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        {status === 'sent' ? (
          <div className="modal-body">
            <p className="order-lead">
              Thanks. Your reference is <strong className="order-ref">{ref}</strong>.
            </p>
            <p className="modal-description">
              I will check that your design can be cut, then email <strong>{email.trim()}</strong>{' '}
              a Shopify invoice from layeredlogic.cc, usually within two days. If the art needs a
              small change first, I will ask before quoting. Nothing is charged until you pay that
              invoice.
            </p>
            <div className="modal-footer order-footer">
              <a className="button-secondary order-link" href={SHOP_URL} target="_blank" rel="noopener">
                Visit the shop
              </a>
              <button className="button-primary" onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} noValidate>
            <div className="modal-body">
              <p className="modal-description">
                Every mirror is made to order by Layered Logic in Seattle. Send me this design and I
                will check it can be cut, then email you a Shopify invoice from layeredlogic.cc,
                usually within two days. <strong>Nothing is charged until you pay that invoice.</strong>
              </p>

              {summary && (
                <dl className="order-summary">
                  <div>
                    <dt>Size</dt>
                    <dd>{sizeLabel}</dd>
                  </div>
                  <div>
                    <dt>Shape</dt>
                    <dd>{summary.hasArt ? 'Your own art' : summary.preset}</dd>
                  </div>
                  <div>
                    <dt>Price</dt>
                    <dd>Custom mirrors start at $100 (6 in square). Other sizes are priced in your quote.</dd>
                  </div>
                </dl>
              )}

              <div className="form-group">
                <label htmlFor="order-name">
                  Name <span className="required">*</span>
                </label>
                <input
                  id="order-name"
                  ref={nameRef}
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={status === 'sending'}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="order-email">
                  Email <span className="required">*</span>
                </label>
                <input
                  id="order-email"
                  type="email"
                  autoComplete="email"
                  placeholder="Where the invoice should go"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={status === 'sending'}
                  required
                />
              </div>

              <div className="form-group">
                <label htmlFor="order-notes">Anything I should know (optional)</label>
                <textarea
                  id="order-notes"
                  rows="3"
                  placeholder="Where it will hang, a date you need it by, a color you are unsure about"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={status === 'sending'}
                  maxLength={2000}
                />
              </div>

              <div className="order-honeypot" aria-hidden="true">
                <label htmlFor="order-company">Company</label>
                <input
                  id="order-company"
                  type="text"
                  tabIndex={-1}
                  autoComplete="off"
                  value={company}
                  onChange={(e) => setCompany(e.target.value)}
                />
              </div>

              {error && (
                <p className="order-error" role="alert">
                  {error}
                </p>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="button-secondary"
                onClick={onClose}
                disabled={status === 'sending'}
              >
                Cancel
              </button>
              <button type="submit" className="button-primary" disabled={!canSend}>
                {status === 'sending' ? 'Sending...' : 'Send my design'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
