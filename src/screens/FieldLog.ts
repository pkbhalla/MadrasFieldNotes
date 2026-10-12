import type { Species } from '../lib/pack-loader';

export interface FieldLogEntry {
  id: string;
  speciesId: string;
  timestamp: number;
  confidence?: number;
  thumbnail?: string;
  matchedFeature?: string;
}

export class FieldLog {
  private static STORAGE_KEY = 'madras-field-notes-log';

  static addEntry(
    speciesId: string,
    confidence?: number,
    thumbnail?: string,
    matchedFeature?: string
  ): FieldLogEntry {
    const entries = this.getEntries();
    const entry: FieldLogEntry = {
      id: crypto.randomUUID ? crypto.randomUUID() : 'log_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      speciesId,
      timestamp: Date.now(),
      confidence,
      thumbnail,
      matchedFeature
    };
    entries.push(entry);
    try {
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
    } catch (e) {
      // If quota exceeded due to thumbnails, strip older thumbnails
      const stripped = entries.map((e, idx) => idx < entries.length - 3 ? { ...e, thumbnail: undefined } : e);
      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stripped));
    }
    return entry;
  }

  static getEntries(): FieldLogEntry[] {
    try {
      const data = localStorage.getItem(this.STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      return [];
    }
  }

  static removeEntry(id: string): void {
    const entries = this.getEntries().filter(e => e.id !== id);
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(entries));
  }

  static clear(): void {
    localStorage.removeItem(this.STORAGE_KEY);
  }

  static exportJSON(): string {
    return JSON.stringify(this.getEntries(), null, 2);
  }

  static getStats(allSpecies: Species[]): { total: number; birds: number; plants: number } {
    const entries = this.getEntries();
    let birds = 0;
    let plants = 0;
    for (const e of entries) {
      const s = allSpecies.find(sp => sp.id === e.speciesId);
      if (s) {
        if (s.type === 'bird') birds++;
        else if (s.type === 'plant') plants++;
      }
    }
    return {
      total: entries.length,
      birds,
      plants
    };
  }
}

