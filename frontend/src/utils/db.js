export const DB_NAME = 'WhisperDB';
export const DB_VERSION = 2;
export const FONTS_STORE = 'fonts';
export const IMAGES_STORE = 'images';

const openDB = () => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = (event) => reject(event.target.error);

    request.onsuccess = (event) => resolve(event.target.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      if (!db.objectStoreNames.contains(FONTS_STORE)) {
        db.createObjectStore(FONTS_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(IMAGES_STORE)) {
        db.createObjectStore(IMAGES_STORE, { keyPath: 'key' });
      }
    };
  });
};

// ── Font helpers ──

export const saveFont = async (fontData) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FONTS_STORE], 'readwrite');
    const store = transaction.objectStore(FONTS_STORE);
    const request = store.put(fontData);

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const getAllFonts = async () => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FONTS_STORE], 'readonly');
    const store = transaction.objectStore(FONTS_STORE);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const deleteFont = async (id) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([FONTS_STORE], 'readwrite');
    const store = transaction.objectStore(FONTS_STORE);
    const request = store.delete(id);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
};

// ── Image helpers ──

export const saveImage = async (key, blob) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readwrite');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.put({ key, blob });

    request.onsuccess = () => resolve(request.result);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const getImage = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readonly');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.get(key);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (event) => reject(event.target.error);
  });
};

export const deleteImage = async (key) => {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([IMAGES_STORE], 'readwrite');
    const store = transaction.objectStore(IMAGES_STORE);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = (event) => reject(event.target.error);
  });
};

export const loadImageUrl = async (key) => {
  const record = await getImage(key);
  if (record && record.blob) {
    return URL.createObjectURL(record.blob);
  }
  return null;
};

export const isExternalUrl = (value) => {
  return typeof value === 'string' && (value.startsWith('http://') || value.startsWith('https://'));
};
