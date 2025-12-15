# Export Feature Documentation

## Overview

The Infinity Mirror Visualizer now includes a comprehensive export feature that allows users to save and export their custom designs for manufacturing. The export includes tamper protection and verification capabilities.

## Features

### 1. Complete Configuration Export
- All design settings (colors, shapes, transformations)
- Custom SVG uploads
- Mirror and reflection settings
- Visual snapshot of the design

### 2. Security & Verification
- Cryptographic signature using SHA-256
- Tamper detection - any modification to the configuration invalidates the signature
- Verification tool included for validating received files

### 3. Export Options
- **Download ZIP**: Save the configuration file locally
- **Send to Manufacturer**: Direct submission (requires API endpoint configuration)

## How to Use

### For Users

1. **Create Your Design**
   - Use the visualizer controls to customize your infinity mirror
   - Choose colors, shapes, and transformations
   - Upload custom SVG files if desired

2. **Export Your Design**
   - Click the "Save & Export Design" button in the controls panel
   - Fill in your information (optional for download, required for direct send)
   - Choose export method:
     - **Download**: Saves a ZIP file to your computer
     - **Send to Manufacturer**: Submits directly (if configured)

3. **What's Included in the Export**
   - `configuration.json`: Complete design specifications with signature
   - `preview.png`: Visual snapshot of your design
   - `README.txt`: Export information and instructions

### For Manufacturers

1. **Receiving Exports**
   - Users can send ZIP files directly or via email
   - Each export contains all necessary manufacturing specifications

2. **Verifying Exports**
   - Open `verify-export.html` in a web browser
   - Drag and drop or select the ZIP file
   - The tool will:
     - Verify the cryptographic signature
     - Display all configuration details
     - Show the preview image
     - Alert if the file has been tampered with

3. **Reading Configuration**
   The `configuration.json` file contains:
   ```json
   {
     "config": {
       "version": "1.0.0",
       "timestamp": "2024-01-15T10:30:00.000Z",
       "icon": {
         "selectedPreset": "hexagon",
         "shapeType": "hexagon",
         "customSvgPath": null,
         "svgRenderMode": "outline"
       },
       "colors": {
         "wallColor": "#fffceb",
         "frameColor": "#424243",
         "lightColor": "#00ffff"
       },
       "transform": {
         "scale": 1.0,
         "rotation": 0,
         "positionX": 0,
         "positionY": 0,
         "edgeThickness": 0.2
       },
       "mirror": {
         "spacing": 20,
         "reflectionDepth": 7
       },
       "customer": {
         "name": "John Doe",
         "email": "john@example.com",
         "notes": "Special requests here",
         "exportDate": "2024-01-15T10:30:00.000Z"
       }
     },
     "signature": "abc123...",
     "signatureVersion": "1.0"
   }
   ```

## Configuration for Direct Send

To enable the "Send to Manufacturer" feature, you need to set up an API endpoint.

### Setting Up the Manufacturer Endpoint

Edit `src/App.jsx` line 185:

```javascript
// Replace this with your actual manufacturer endpoint
const manufacturerEndpoint = 'https://your-manufacturer-api.com/upload'
```

### API Endpoint Requirements

Your endpoint should:
- Accept POST requests with `multipart/form-data`
- Receive the following fields:
  - `file`: The ZIP file (blob)
  - `customerName`: Customer's name (string)
  - `customerEmail`: Customer's email (string)
  - `notes`: Additional notes (string)
- Return JSON response:
  ```json
  {
    "success": true,
    "message": "Order received",
    "orderId": "12345"
  }
  ```

### Example API Implementation (Node.js/Express)

```javascript
const express = require('express');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

app.post('/upload', upload.single('file'), async (req, res) => {
  try {
    const { customerName, customerEmail, notes } = req.body;
    const file = req.file;

    // Verify the file signature here (important!)
    const isValid = await verifyExportFile(file.path);
    if (!isValid) {
      return res.status(400).json({
        success: false,
        error: 'Invalid or tampered file'
      });
    }

    // Process the order
    const orderId = await createManufacturingOrder({
      file: file.path,
      customerName,
      customerEmail,
      notes
    });

    // Send confirmation email
    await sendConfirmationEmail(customerEmail, orderId);

    res.json({
      success: true,
      message: 'Order received successfully',
      orderId
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});
```

## Security Details

### Signature Generation

The export uses SHA-256 hashing with a secret key to create a tamper-proof signature:

1. Configuration data is serialized to JSON
2. Secret key is appended: `INFINITY_MIRROR_V1`
3. SHA-256 hash is computed
4. Resulting signature is stored with the export

### Verification Process

The verification tool:
1. Loads the ZIP file
2. Extracts the configuration and signature
3. Recalculates the expected signature
4. Compares signatures - must match exactly
5. Any modification to the configuration will result in signature mismatch

### Changing the Secret Key

To change the secret key (for added security):

1. Edit `src/utils/exportUtils.js`:
   ```javascript
   async function generateSignature(data, secretKey = 'YOUR_NEW_SECRET_KEY') {
   ```

2. Update `verify-export.html`:
   ```javascript
   async function generateSignature(data, secretKey = 'YOUR_NEW_SECRET_KEY') {
   ```

**Important**: Both must use the same secret key for verification to work.

## File Structure

```
infinity-mirror-config.zip
├── configuration.json    (Design specs + signature)
├── preview.png          (Visual snapshot)
└── README.txt           (Export information)
```

## Troubleshooting

### Export not working
- Check browser console for errors
- Ensure canvas is visible when exporting (snapshot requires rendered canvas)
- Verify all dependencies are installed (`npm install`)

### Signature verification fails
- File may have been modified
- Secret keys may not match between export and verification
- JSON formatting may have changed

### Direct send fails
- Check manufacturer endpoint URL
- Verify endpoint is accessible
- Check CORS settings on the manufacturer server
- Fallback: Use download option and send manually

## Technical Specifications

### Dependencies
- `jszip`: ZIP file creation and parsing
- Browser Crypto API: SHA-256 signature generation

### Browser Compatibility
- Chrome/Edge: Full support
- Firefox: Full support
- Safari: Full support (requires HTTPS for canvas export)
- Mobile browsers: Supported with touch controls

### File Size
- Typical export: 50-200 KB
- With custom SVG: Varies based on SVG complexity
- PNG snapshot: ~100-500 KB (depends on canvas resolution)

## Future Enhancements

Potential improvements:
- Import/load saved configurations
- Multiple design comparison
- Design history/versioning
- QR code generation for easy mobile sharing
- Cloud storage integration
- Order tracking integration

## Support

For issues or questions:
- GitHub: [Repository Issues](https://github.com/your-repo/issues)
- Email: support@your-domain.com

## License

This export feature is part of the Infinity Mirror Visualizer project.
