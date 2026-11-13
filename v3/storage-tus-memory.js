// TUS URLs can identify in-progress private uploads. Never persist them to
// localStorage, sessionStorage, IndexedDB, cookies or server telemetry.
const MAX_URL_AGE_MS = 60 * 60 * 1000;
const MAX_ENTRIES = 24;
const VALID_ORIGIN = 'https://ztqtcbzjesrkuaijmylm.storage.supabase.co';
const entries = new Map();

function safeUrl(value) {
  try {
    const u = new URL(value);
    return u.origin === VALID_ORIGIN &&
      u.pathname.startsWith('/storage/v1/upload/resumable/');
  } catch { return false; }
}
function prune(now = Date.now()) {
  for (const [key,record] of entries) {
    if (now-record.savedAt > MAX_URL_AGE_MS || !safeUrl(record.entry?.uploadUrl)) {
      entries.delete(key);
    }
  }
  while (entries.size > MAX_ENTRIES) {
    entries.delete(entries.keys().next().value);
  }
}
const clone = (record) => ({
  ...record.entry, metadata: { ...(record.entry.metadata || {}) }
});
export const memoryTusUrlStorage = Object.freeze({
  async findAllUploads() {
    prune();
    return [...entries.values()].map(clone);
  },
  async findUploadsByFingerprint(fingerprint) {
    prune();
    return [...entries.values()].filter(x=>x.fingerprint === fingerprint).map(clone);
  },
  async removeUpload(key) { entries.delete(key); },
  async addUpload(fingerprint, upload) {
    prune();
    if (!safeUrl(upload?.uploadUrl) || typeof fingerprint !== 'string' ||
        fingerprint.length > 1000) throw new Error('Retomada TUS insegura bloqueada.');
    const key = 'xrmovi-private-tus-' + crypto.randomUUID();
    entries.set(key, {
      fingerprint,
      savedAt: Date.now(),
      entry: { ...upload, urlStorageKey: key,
        metadata: { ...(upload.metadata || {}) } }
    });
    prune();
    return key;
  }
});
export function clearMemoryTusUploads() { entries.clear(); }
