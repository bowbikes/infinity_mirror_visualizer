import JSZip from 'jszip';

/**
 * Plain SHA-256 hash of the serialized config. This is an *integrity*
 * checksum — it catches accidental corruption in transit, not tampering.
 *
 * (Real tamper protection requires a signature with a private key that
 * never reaches the client. An earlier version of this file used a
 * hardcoded secret baked into the bundle, which provided no actual
 * protection — anyone with the JS could re-sign anything. Removed.)
 */
async function computeIntegrityHash(data) {
  const encoder = new TextEncoder();
  const buffer = encoder.encode(JSON.stringify(data));
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function verifyIntegrityHash(data, hash) {
  const expected = await computeIntegrityHash(data);
  return expected === hash;
}

/**
 * Captures a screenshot of the Three.js canvas.
 * Uses renderer.domElement.toDataURL() which works without preserveDrawingBuffer.
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
            const dataUrl = canvasElement.toDataURL('image/png', 1.0);
            fetch(dataUrl)
              .then((res) => res.blob())
              .then((blob) => resolve(blob || null))
              .catch((error) => {
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

const CUSTOM_SVG_FILENAME = 'custom-icon.svg';

/**
 * Serializes the complete scene configuration. The custom SVG (which can
 * be many KB) is *not* embedded in the JSON — it's written as a sibling
 * file in the export ZIP and referenced by filename here.
 */
export function serializeConfiguration(state) {
  const hasCustomSvg = state.customSvgPath && state.shapeType === 'custom';
  return {
    version: '1.1.0',
    timestamp: new Date().toISOString(),

    icon: {
      selectedPreset: state.selectedPreset,
      shapeType: state.shapeType,
      svgRenderMode: state.svgRenderMode,
      customSvgFilename: hasCustomSvg ? CUSTOM_SVG_FILENAME : null,
    },

    colors: {
      wallColor: state.wallColor,
      frameColor: state.frameColor,
      lightColor: state.lightColor,
    },

    transform: {
      scale: state.iconScale,
      rotation: state.iconRotation,
      positionX: state.iconPositionX,
      positionY: state.iconPositionY,
      edgeThickness: state.edgeThickness,
    },

    mirror: {
      frameDepthMm: state.frameDepthMm,
      reflectionDepth: state.reflectionDepth,
    },

    performance: {
      autoOrbit: state.autoOrbit,
      enableBloom: state.enableBloom,
    },

    // Non-serialized: the raw SVG text travels alongside in the ZIP, not
    // here. Pass it to createExportZip directly via the customSvgPath arg.
  };
}

/**
 * Creates a ZIP with the configuration JSON, snapshot, custom SVG (if any),
 * and a README. The integrity hash inside the JSON covers the JSON only —
 * not a tamper-proof signature, just a checksum to catch corruption.
 */
export async function createExportZip(config, snapshotBlob, customerInfo = {}, customSvgPath = null) {
  const zip = new JSZip();

  const configWithMeta = {
    ...config,
    customer: {
      name: customerInfo.name || 'Anonymous',
      email: customerInfo.email || '',
      notes: customerInfo.notes || '',
      exportDate: new Date().toISOString(),
    },
  };

  const integrityHash = await computeIntegrityHash(configWithMeta);

  zip.file(
    'configuration.json',
    JSON.stringify(
      {
        config: configWithMeta,
        integrityHash,
        integrityVersion: '1.0',
      },
      null,
      2
    )
  );

  if (snapshotBlob) zip.file('preview.png', snapshotBlob);

  const hasCustomSvg = customSvgPath && config.icon.shapeType === 'custom';
  if (hasCustomSvg) zip.file(CUSTOM_SVG_FILENAME, customSvgPath);

  zip.file(
    'README.txt',
    `Infinity Mirror Configuration Export
=====================================

Export Date: ${new Date().toISOString()}
Customer: ${customerInfo.name || 'Anonymous'}
Email: ${customerInfo.email || 'N/A'}

Files Included:
- configuration.json   Scene configuration with an integrity checksum
- preview.png          Visual snapshot of the configured design${hasCustomSvg ? `
- ${CUSTOM_SVG_FILENAME}       User-uploaded custom SVG icon` : ''}

The integrity checksum (SHA-256 of the config JSON) detects accidental
corruption in transit. It is NOT a tamper-proof signature — a modified
config can be re-hashed by anyone. For tamper protection, sign the ZIP
file with the manufacturer's PGP key out-of-band.
`
  );

  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });
}

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
    return { success: true, data: await response.json() };
  } catch (error) {
    console.error('Error sending to manufacturer:', error);
    return { success: false, error: error.message };
  }
}

/**
 * Validates an imported configuration ZIP. Checks the integrity hash and
 * pulls out the custom SVG (if present) so the caller can re-hydrate state.
 */
export async function validateImportedConfig(zipBlob) {
  try {
    const zip = await JSZip.loadAsync(zipBlob);
    const configFile = zip.file('configuration.json');
    if (!configFile) {
      return { valid: false, error: 'Missing configuration.json' };
    }
    const exportData = JSON.parse(await configFile.async('text'));
    const hash = exportData.integrityHash || exportData.signature; // back-compat for v1.0
    const ok = await verifyIntegrityHash(exportData.config, hash);
    if (!ok) {
      return { valid: false, error: 'Integrity check failed — file may be corrupted' };
    }

    let customSvgPath = null;
    const customSvgFile = zip.file(CUSTOM_SVG_FILENAME);
    if (customSvgFile) {
      customSvgPath = await customSvgFile.async('text');
    }
    return { valid: true, config: exportData.config, customSvgPath };
  } catch (error) {
    return { valid: false, error: error.message };
  }
}
