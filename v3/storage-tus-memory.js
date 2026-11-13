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


// One-time cleanup of ONLY the old XRMOVI tus-js-client v4 fingerprint keys.
// Earlier versions wrote private resume URLs to localStorage as
// tus::xrmovi-v1:<user>:<bucket>:<path>:...::<id>.
// Does not touch auth data, other apps' uploads or remote Storage objects.
export function purgeLegacyTusBrowserKeys(storage = null) {
  let removed = 0;
  try {
    const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
    if (!target) return 0;
    const matches = [];
    for (let i = 0; i < target.length; i++) {
      const key = target.key(i);
      if (typeof key === 'string' && key.startsWith('tus::xrmovi-v1:')) matches.push(key);
    }
    for (const key of matches) { target.removeItem(key); removed++; }
  } catch { /* Browser storage may be disabled; uploads remain memory-only. */ }
  return removed;
}
purgeLegacyTusBrowserKeys();
