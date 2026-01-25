export const DB_NAME = 'WhisperDB';
export const DB_VERSION = 1;
export const FONTS_STORE = 'fonts';

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
    };
  });
};

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
