// XRMOVI: non-destructive, client-side image optimization.
// All PDF bytes are passed through unchanged, including PAdES/CMS signed PDFs.
// This module never reads a storage token or changes customer permissions.
export const SUPPORTED_IMAGES = Object.freeze({
 'image/jpeg': 'jpg',
 'image/png': 'png',
 'image/webp': 'webp'
});
export const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
const MAX_PIXELS = 40_000_000;
const PRESETS = Object.freeze({
 logo: Object.freeze({ maxEdge: 1200, quality: 0.88 }),
 document: Object.freeze({ maxEdge: 3200, quality: 0.93 }),
 proof: Object.freeze({ maxEdge: 2560, quality: 0.90 })
});

export function formatBytes(bytes) {
 if (!Number.isFinite(bytes) || bytes < 0) return '—';
 if (bytes < 1024) return bytes + ' B';
 if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1).replace('.', ',') + ' KiB';
 return (bytes / (1024 * 1024)).toFixed(2).replace('.', ',') + ' MiB';
}
export function uploadSummary(stats) {
 if (!stats) return '';
 const oldSize = formatBytes(stats.originalBytes), newSize = formatBytes(stats.finalBytes);
 if (!stats.reduced) return 'Arquivo preservado: ' + oldSize + '.';
 return 'Otimizado: ' + oldSize + ' → ' + newSize + ' (' + Math.round(stats.savedBytes * 100 / stats.originalBytes) + '% menor).';
}

async function hasPdfHeader(blob) {
 // Accommodate a PDF header inside the first 1024 bytes; do not parse or rewrite a PDF.
 const prefix = new Uint8Array(await blob.slice(0, 1024).arrayBuffer());
 const ascii = String.fromCharCode(...prefix);
 return /%PDF-[12]\.\d/.test(ascii);
}
async function decodeForCanvas(blob) {
 if (typeof createImageBitmap === 'function') {
  try {
   // Explicit EXIF-aware orientation where supported by the browser.
   const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
   return { image: bitmap, width: bitmap.width, height: bitmap.height, close: () => bitmap.close?.() };
  } catch { /* Image.decode below covers browsers without this option. */ }
 }
 const url = URL.createObjectURL(blob);
 try {
  const image = new Image();
  image.src = url;
  await image.decode();
  return { image, width: image.naturalWidth, height: image.naturalHeight, close: () => {} };
 } finally {
  URL.revokeObjectURL(url);
 }
}
function toCanvasBlob(canvas, mime, quality) {
 return new Promise((resolve, reject) => {
  canvas.toBlob(blob => blob?.size ? resolve(blob) : reject(new Error('Falha ao compactar a imagem.')), mime, quality);
 });
}
function imageFile(blob, input) {
 const ext = SUPPORTED_IMAGES[blob.type];
 if (!ext) throw new Error('O navegador não ofereceu um formato de imagem compatível.');
 // File name and metadata must match the actual optimized MIME type.
 const base = (input.name || 'imagem').replace(/\.(jpe?g|png|webp)$/i, '').slice(0, 150);
 return new File([blob], base + '.' + ext, { type: blob.type, lastModified: input.lastModified || Date.now() });
}

/**
 * Returns { file, stats }. PDF returns the original File reference, byte for byte.
 * Never accepts an output larger than the source. Browser failure is fail-closed
 * for files over the destination limit; already-valid originals can be retained.
 */
export async function optimizeUploadFile(input, {
 purpose = 'document', maxBytes = 10 * 1024 * 1024, maxSourceBytes = MAX_SOURCE_BYTES, onPhase = () => {}
} = {}) {
 if (!(input instanceof Blob) || !Number.isFinite(input.size) || !input.size) {
  throw new Error('Selecione um arquivo válido.');
 }
 if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error('Limite de upload inválido.');
 if (input.size > maxSourceBytes) throw new Error('Arquivo original acima do limite de ' + formatBytes(maxSourceBytes) + '.');
 const mime = input.type.toLowerCase();
 if (mime !== 'application/pdf' && !Object.hasOwn(SUPPORTED_IMAGES, mime)) {
  throw new Error('Use um PDF, JPG, PNG ou WebP.');
 }
 const stats = {originalBytes: input.size, finalBytes: input.size, savedBytes: 0, reduced: false, mime, reason: 'original'};
 onPhase('validating', stats);
 if (mime === 'application/pdf') {
  if (!await hasPdfHeader(input)) throw new Error('O arquivo selecionado não é um PDF válido.');
  if (input.size > maxBytes) throw new Error('O PDF excede o limite de ' + formatBytes(maxBytes) + '. Não será alterado.');
  return { file: input, stats: {...stats, reason: 'pdf-preserved'} };
 }
 const preset = PRESETS[purpose] || PRESETS.document;
 let candidate = input;
 onPhase('optimizing', stats);
 let decoded;
 try { decoded = await decodeForCanvas(input); }
 catch { throw new Error('Imagem corrompida ou ilegível. Selecione outra foto.'); }
 const {width, height} = decoded;
 if (!width || !height || width * height > MAX_PIXELS) {
  decoded.close();
  throw new Error('Imagem com resolução excessiva ou inválida.');
 }
 try {
  const scale = Math.min(1, preset.maxEdge / Math.max(width, height));
  // For PNG, do not remove alpha or introduce JPEG artifacts in document text.
  // PNG re-encoding without downscaling has no reliable benefit.
  if (scale < 1 || mime !== 'image/png') {
   const canvas = document.createElement('canvas');
   canvas.width = Math.max(1, Math.round(width * scale));
   canvas.height = Math.max(1, Math.round(height * scale));
   const context = canvas.getContext('2d');
   if (!context) throw new Error('Canvas indisponível.');
   context.imageSmoothingEnabled = true;
   context.imageSmoothingQuality = 'high';
   context.drawImage(decoded.image, 0, 0, canvas.width, canvas.height);
   const encoded = await toCanvasBlob(canvas, mime, preset.quality);
   // Keep original unless the difference is meaningful (>= 8%) and the new
   // output is strictly smaller; avoids recompression and pointless transfers.
   if (encoded.type === mime && encoded.size < input.size * 0.92) candidate = imageFile(encoded, input);
  }
 } catch (error) {
  if (input.size > maxBytes) throw new Error('Não foi possível reduzir a imagem para o limite permitido: ' + error.message);
  // No destructive fallback: a valid original is safer than a corrupt conversion.
  stats.reason = 'original-fallback';
 } finally { decoded?.close(); }
 if (candidate.size > maxBytes) {
  throw new Error('Imagem acima do limite de ' + formatBytes(maxBytes) + ', mesmo após otimização.');
 }
 return {
  file: candidate,
  stats: {...stats, finalBytes: candidate.size, savedBytes: input.size - candidate.size,
   reduced: candidate !== input, mime: candidate.type, reason: candidate === input ? stats.reason : 'optimized'}
 };
}

/** Only avoids repeated successful uploads to the exact same record in this tab. */
export async function fingerprintUpload(file) {
 if (!(file instanceof Blob)) throw new Error('Arquivo inválido.');
 const bytes = await file.arrayBuffer();
 const hash = await crypto.subtle.digest('SHA-256', bytes);
 return Array.from(new Uint8Array(hash), b => b.toString(16).padStart(2,'0')).join('');
}
