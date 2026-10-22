// src/lib/dataCache.js
// Cache snapshot data Supabase ke IndexedDB supaya membuka halaman terasa instan
// (data langsung tampil dari cache), lalu diperbarui "di belakang" dari Supabase
// (pola stale-while-revalidate).
//
// - Per tabel disimpan sebagai record { version, savedAt, rows }
// - Jika struktur cache berubah, tinggal naikkan CACHE_VERSION — data lama otomatis dibuang
// - Semua operasi aman gagal (mode private browser dsb.): jika IndexedDB tak tersedia,
//   fungsi mengembalikan null sehingga pemanggil bisa lanjut dengan fetch normal

const DB_NAME = "ccm-dashboard-cache";
const DB_VERSION = 1;
const STORE = "tables";

export const CACHE_VERSION = 1;

// Data dianggap "usang" setelah 24 jam → abaikan cache, tarik langsung dari Supabase
export const STALE_AFTER_MS = 24 * 60 * 60 * 1000;

let dbPromise = null;

function getDB() {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  if (!dbPromise) {
    dbPromise = new Promise((resolve) => {
      let req;
      try {
        req = indexedDB.open(DB_NAME, DB_VERSION);
      } catch {
        return resolve(null);
      }
      req.onupgradeneeded = () => {
        try {
          if (!req.result.objectStoreNames.contains(STORE)) {
            req.result.createObjectStore(STORE);
          }
        } catch (e) {
          // ignore
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => {}; // tunggu success alami
    });
  }
  return dbPromise;
}

// Ambil 1 cache tabel. Mengembalikan { savedAt, rows } atau null.
export async function loadCachedTable(name) {
  try {
    const db = await getDB();
    if (!db) return null;
    const tx = db.transaction(STORE, "readonly");
    const rec = await new Promise((resolve) => {
      const r = tx.objectStore(STORE).get(name);
      r.onsuccess = () => resolve(r.result);
      r.onerror = () => resolve(null);
    });
    if (!rec || rec.version !== CACHE_VERSION || !Array.isArray(rec.rows)) return null;
    return { savedAt: rec.savedAt || 0, rows: rec.rows };
  } catch {
    return null;
  }
}

// Simpan snapshot 1 tabel. Mengembalikan savedAt atau null bila gagal.
export async function saveCachedTable(name, rows) {
  try {
    const db = await getDB();
    if (!db) return null;
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put({ version: CACHE_VERSION, savedAt: Date.now(), rows: rows || [] }, name);
    return await new Promise((resolve) => {
      tx.oncomplete = () => resolve(Date.now());
      tx.onerror = () => resolve(null);
      tx.onabort = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Ambil banyak tabel sekaligus.
// Return: { tables: {nama: rows}, savedAt: timestamp terbaru, loaded: [nama yang ada] }
export async function loadAllCached(names) {
  const out = { tables: {}, savedAt: 0, loaded: [] };
  await Promise.all(
    names.map(async (n) => {
      const rec = await loadCachedTable(n);
      if (rec) {
        out.tables[n] = rec.rows;
        out.savedAt = Math.max(out.savedAt, rec.savedAt);
        out.loaded.push(n);
      }
    })
  );
  return out;
}

// Cache masih segar (belum melewati batas usang)?
export function isFresh(savedAt) {
  return savedAt > 0 && Date.now() - savedAt < STALE_AFTER_MS;
}

// Format "HH:MM" untuk ditampilkan di UI
export function formatSavedAt(ts) {
  try {
    return new Date(ts).toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}
