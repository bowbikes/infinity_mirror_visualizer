import { useState } from 'react';
import './ExportModal.css';

export default function ExportModal({
  isOpen,
  onClose,
  onExport,
  onSendToManufacturer,
  isProcessing
}) {
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [notes, setNotes] = useState('');
  const [sendMethod, setSendMethod] = useState('download'); // 'download' or 'send'

  if (!isOpen) return null;

  const handleExport = () => {
    const customerInfo = {
      name: customerName.trim(),
      email: customerEmail.trim(),
      notes: notes.trim(),
    };

    if (sendMethod === 'send') {
      onSendToManufacturer(customerInfo);
    } else {
      onExport(customerInfo);
    }
  };

  const isFormValid = () => {
    if (sendMethod === 'send') {
      // Require name and email for direct send
      return customerName.trim() && customerEmail.trim() && customerEmail.includes('@');
    }
    // For download, no requirements
    return true;
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Save & Export Configuration</h2>
          <button className="close-button" onClick={onClose} disabled={isProcessing}>
            ×
          </button>
        </div>

        <div className="modal-body">
          <p className="modal-description">
            Export your custom infinity mirror design. The export includes:
          </p>
          <ul className="export-features">
            <li>A preview snapshot of your design</li>
            <li>Complete configuration (colors, shape, transformations)</li>
            <li>Cryptographic signature for tamper detection</li>
          </ul>

          <div className="form-section">
            <h3>Export Method</h3>
            <div className="radio-group">
              <label className="radio-label">
                <input
                  type="radio"
                  value="download"
                  checked={sendMethod === 'download'}
                  onChange={(e) => setSendMethod(e.target.value)}
                  disabled={isProcessing}
                />
                <span>Download ZIP file</span>
              </label>
              <label className="radio-label">
                <input
                  type="radio"
                  value="send"
                  checked={sendMethod === 'send'}
                  onChange={(e) => setSendMethod(e.target.value)}
                  disabled={isProcessing}
                />
                <span>Send directly to manufacturer</span>
              </label>
            </div>
          </div>

          <div className="form-section">
            <h3>Customer Information {sendMethod === 'send' && <span className="required">*</span>}</h3>

            <div className="form-group">
              <label htmlFor="customer-name">
                Name {sendMethod === 'send' && <span className="required">*</span>}
              </label>
              <input
                id="customer-name"
                type="text"
                placeholder="Your name"
                value={customerName}
                onChange={(e) => setCustomerName(e.target.value)}
                disabled={isProcessing}
                required={sendMethod === 'send'}
              />
            </div>

            <div className="form-group">
              <label htmlFor="customer-email">
                Email {sendMethod === 'send' && <span className="required">*</span>}
              </label>
              <input
                id="customer-email"
                type="email"
                placeholder="your.email@example.com"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                disabled={isProcessing}
                required={sendMethod === 'send'}
              />
            </div>

            <div className="form-group">
              <label htmlFor="customer-notes">
                Additional Notes (Optional)
              </label>
              <textarea
                id="customer-notes"
                placeholder="Any special requests or notes for manufacturing..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={isProcessing}
                rows="3"
              />
            </div>
          </div>

          <div className="security-notice">
            <strong>Security:</strong> This export includes a cryptographic signature.
            Any modifications to the configuration file will invalidate the signature,
            ensuring the manufacturer receives authentic, unaltered designs.
          </div>
        </div>

        <div className="modal-footer">
          <button
            className="button-secondary"
            onClick={onClose}
            disabled={isProcessing}
          >
            Cancel
          </button>
          <button
            className="button-primary"
            onClick={handleExport}
            disabled={!isFormValid() || isProcessing}
          >
            {isProcessing ? (
              <span>Processing...</span>
            ) : sendMethod === 'send' ? (
              <span>Send to Manufacturer</span>
            ) : (
              <span>Download Export</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
