import JSZip from 'jszip';

/**
 * Generates a cryptographic signature for the configuration data
 * Uses a simple HMAC-like approach with Web Crypto API
 */
async function generateSignature(data, secretKey = 'INFINITY_MIRROR_V1') {
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(JSON.stringify(data) + secretKey);

  const hashBuffer = await crypto.subtle.digest('SHA-256', dataBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  return hashHex;
}

/**
 * Verifies the signature of a configuration file
 */
export async function verifySignature(data, signature, secretKey = 'INFINITY_MIRROR_V1') {
  const expectedSignature = await generateSignature(data, secretKey);
  return expectedSignature === signature;
}

/**
 * Captures a screenshot of the Three.js canvas
 * Uses renderer.domElement.toDataURL() which works without preserveDrawingBuffer
 */
export function captureCanvasSnapshot(canvasElement) {
  return new Promise((resolve) => {
    if (!canvasElement) {
      resolve(null);
      return;
    }

    try {
      // Wait for next frame to ensure canvas is rendered
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          try {
            // Use toDataURL which works better with post-processing
            const dataUrl = canvasElement.toDataURL('image/png', 1.0);

            // Convert data URL to blob
            fetch(dataUrl)
              .then(res => res.blob())
              .then(blob => {
                if (!blob) {
                  console.error('Failed to create blob from canvas');
                  resolve(null);
                  return;
                }
                resolve(blob);
              })
              .catch(error => {
                console.error('Error converting data URL to blob:', error);
                resolve(null);
              });
          } catch (error) {
            console.error('Error capturing canvas:', error);
            resolve(null);
          }
        });
      });
    } catch (error) {
      console.error('Error capturing canvas:', error);
      resolve(null);
    }
  });
}

/**
 * Serializes the complete scene configuration
 */
export function serializeConfiguration(state) {
  const config = {
    version: '1.0.0',
    timestamp: new Date().toISOString(),

    // Icon/Shape configuration
    icon: {
      selectedPreset: state.selectedPreset,
      shapeType: state.shapeType,
      customSvgPath: state.customSvgPath,
      svgRenderMode: state.svgRenderMode,
    },

    // Colors
    colors: {
      wallColor: state.wallColor,
      frameColor: state.frameColor,
      lightColor: state.lightColor,
    },

    // Transform parameters
    transform: {
      scale: state.iconScale,
      rotation: state.iconRotation,
      positionX: state.iconPositionX,
      positionY: state.iconPositionY,
      edgeThickness: state.edgeThickness,
    },

    // Mirror settings
    mirror: {
      spacing: state.mirrorSpacing,
      reflectionDepth: state.reflectionDepth,
    },

    // Performance settings
    performance: {
      autoOrbit: state.autoOrbit,
      enableBloom: state.enableBloom,
    },
  };

  return config;
}

/**
 * Creates a ZIP file with the configuration and snapshot
 */
export async function createExportZip(config, snapshotBlob, customerInfo = {}) {
  const zip = new JSZip();

  // Add configuration JSON
  const configWithMeta = {
    ...config,
    customer: {
      name: customerInfo.name || 'Anonymous',
      email: customerInfo.email || '',
      notes: customerInfo.notes || '',
      exportDate: new Date().toISOString(),
    },
  };

  // Generate signature for tamper detection
  const signature = await generateSignature(configWithMeta);

  const exportData = {
    config: configWithMeta,
    signature: signature,
    signatureVersion: '1.0',
  };

  zip.file('configuration.json', JSON.stringify(exportData, null, 2));

  // Add snapshot image if available
  if (snapshotBlob) {
    zip.file('preview.png', snapshotBlob);
  }

  // Add custom SVG file if user uploaded one
  if (config.icon.customSvgPath && config.icon.shapeType === 'custom') {
    zip.file('custom-icon.svg', config.icon.customSvgPath);
  }

  // Add README with instructions
  const hasCustomSvg = config.icon.customSvgPath && config.icon.shapeType === 'custom';
  const readme = `Infinity Mirror Configuration Export
=====================================

Export Date: ${new Date().toISOString()}
Customer: ${customerInfo.name || 'Anonymous'}
Email: ${customerInfo.email || 'N/A'}

Files Included:
- configuration.json: Complete scene configuration with cryptographic signature
- preview.png: Visual snapshot of the configured design${hasCustomSvg ? '\n- custom-icon.svg: User-uploaded custom SVG icon file' : ''}

This file contains a cryptographic signature to prevent tampering.
DO NOT modify the configuration.json file or the signature will be invalid.

For manufacturing, send this ZIP file to the manufacturer.
`;

  zip.file('README.txt', readme);

  // Generate ZIP blob
  const zipBlob = await zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 }
  });

  return zipBlob;
}

/**
 * Downloads the ZIP file to the user's computer
 */
export function downloadZipFile(zipBlob, filename = 'infinity-mirror-config.zip') {
  const url = URL.createObjectURL(zipBlob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Sends the export file to the manufacturer via email/API
 */
export async function sendToManufacturer(zipBlob, customerInfo, manufacturerEndpoint) {
  const formData = new FormData();
  formData.append('file', zipBlob, 'infinity-mirror-config.zip');
  formData.append('customerName', customerInfo.name || 'Anonymous');
  formData.append('customerEmail', customerInfo.email || '');
  formData.append('notes', customerInfo.notes || '');

  try {
    const response = await fetch(manufacturerEndpoint, {
      method: 'POST',
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Server responded with ${response.status}`);
    }

    const result = await response.json();
    return { success: true, data: result };
  } catch (error) {
    console.error('Error sending to manufacturer:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validates an imported configuration file
 */
export async function validateImportedConfig(zipBlob) {
  try {
    const zip = await JSZip.loadAsync(zipBlob);

    // Check for required files
    const configFile = zip.file('configuration.json');
    if (!configFile) {
      return { valid: false, error: 'Missing configuration.json' };
    }

    // Parse configuration
    const configText = await configFile.async('text');
    const exportData = JSON.parse(configText);

    // Verify signature
    const isValid = await verifySignature(exportData.config, exportData.signature);

    if (!isValid) {
      return { valid: false, error: 'Invalid signature - file may have been tampered with' };
    }

    return { valid: true, config: exportData.config };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
