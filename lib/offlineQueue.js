// Offline queue for inspection answers/photos, backed by IndexedDB — the
// browser's built-in database, not localStorage. Chosen because it can
// hold binary photo data directly and survives far more reliably than
// localStorage across a browser session. No extra npm package needed —
// this uses the native browser API.

const DB_NAME = "sentinelx-offline";
const DB_VERSION = 1;
const ANSWERS_STORE = "pending-answers";
const PHOTOS_STORE = "pending-photos";

function openDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB not available"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(ANSWERS_STORE)) {
        db.createObjectStore(ANSWERS_STORE, { keyPath: "key" });
      }
      if (!db.objectStoreNames.contains(PHOTOS_STORE)) {
        db.createObjectStore(PHOTOS_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function keyFor(inspectionId, itemId) {
  return `${inspectionId}:${itemId}`;
}

export async function queueAnswer(inspectionId, itemId, { value, notes }) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, "readwrite");
    tx.objectStore(ANSWERS_STORE).put({
      key: keyFor(inspectionId, itemId),
      inspectionId,
      itemId,
      value,
      notes,
      queuedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedAnswers(inspectionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ANSWERS_STORE, "readonly").objectStore(ANSWERS_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).filter((r) => r.inspectionId === inspectionId));
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedAnswer(inspectionId, itemId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANSWERS_STORE, "readwrite");
    tx.objectStore(ANSWERS_STORE).delete(keyFor(inspectionId, itemId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function queuePhoto(inspectionId, itemId, blob, fileName) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, "readwrite");
    tx.objectStore(PHOTOS_STORE).put({
      key: keyFor(inspectionId, itemId),
      inspectionId,
      itemId,
      blob,
      fileName,
      queuedAt: Date.now(),
    });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getQueuedPhotos(inspectionId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(PHOTOS_STORE, "readonly").objectStore(PHOTOS_STORE).getAll();
    req.onsuccess = () => resolve((req.result || []).filter((r) => r.inspectionId === inspectionId));
    req.onerror = () => reject(req.error);
  });
}

export async function removeQueuedPhoto(inspectionId, itemId) {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTOS_STORE, "readwrite");
    tx.objectStore(PHOTOS_STORE).delete(keyFor(inspectionId, itemId));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// Used for a small "you have unsynced work" indicator anywhere in the app,
// not just on the inspection page itself.
export async function getAllQueuedInspectionIds() {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const req = db.transaction(ANSWERS_STORE, "readonly").objectStore(ANSWERS_STORE).getAll();
    req.onsuccess = () => resolve([...new Set((req.result || []).map((r) => r.inspectionId))]);
    req.onerror = () => reject(req.error);
  });
}
