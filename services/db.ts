
import { SavedAnalysis, AnalysisMode } from '../types';

const DB_NAME = 'ClipAnalyzerDB';
const STORE_NAME = 'analyses';
const DB_VERSION = 1;

export class AnalysisDatabase {
  private db: IDBDatabase | null = null;

  async init(): Promise<void> {
    if (this.db) return;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = (event) => {
        console.error("Database error:", event);
        reject("Failed to open database");
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('type', 'type', { unique: false });
          store.createIndex('date', 'date', { unique: false });
          store.createIndex('timestamp', 'timestamp', { unique: false });
        }
      };

      request.onsuccess = (event) => {
        this.db = (event.target as IDBOpenDBRequest).result;
        resolve();
      };
    });
  }

  async saveAnalysis(type: AnalysisMode, fileName: string, data: any): Promise<number> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("Database not initialized");

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);

      const analysis: Omit<SavedAnalysis, 'id'> = {
        type,
        fileName,
        date: new Date().toLocaleDateString(),
        timestamp: Date.now(),
        data
      };

      const request = store.add(analysis);

      request.onsuccess = (event) => {
        resolve((event.target as IDBRequest).result as number);
      };

      request.onerror = () => {
        reject("Failed to save analysis");
      };
    });
  }

  async getAllAnalyses(): Promise<SavedAnalysis[]> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("Database not initialized");

      const transaction = this.db.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp'); // Sort by timestamp
      
      // Use openCursor to get results in reverse order (newest first)
      const request = index.openCursor(null, 'prev');
      const results: SavedAnalysis[] = [];

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result as IDBCursorWithValue;
        if (cursor) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results);
        }
      };

      request.onerror = () => {
        reject("Failed to fetch analyses");
      };
    });
  }

  async deleteAnalysis(id: number): Promise<void> {
    await this.init();
    return new Promise((resolve, reject) => {
      if (!this.db) return reject("Database not initialized");

      const transaction = this.db.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(id);

      request.onsuccess = () => resolve();
      request.onerror = () => reject("Failed to delete item");
    });
  }
}

export const dbService = new AnalysisDatabase();
