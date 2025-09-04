import * as path from "path";
import * as fs from "fs";

export class TranslationCache {
  private cache: Map<string, string> = new Map();
  private cachePath: string;
  private isDirty = false;

  constructor() {
    // Create cache directory if it doesn't exist
    const cacheDir = path.join(process.cwd(), "cache");
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }

    this.cachePath = path.join(cacheDir, "translations.json");
    this.loadCache();
  }

  private loadCache(): void {
    try {
      if (fs.existsSync(this.cachePath)) {
        const data = fs.readFileSync(this.cachePath, "utf8");
        const cacheData = JSON.parse(data);
        this.cache = new Map(Object.entries(cacheData));
        console.log(`Loaded ${this.cache.size} translations from cache`);
      }
    } catch (error) {
      console.error("Error loading cache:", error);
      this.cache = new Map();
    }
  }

  private saveCache(): void {
    if (!this.isDirty) return;

    try {
      const cacheData = Object.fromEntries(this.cache);
      fs.writeFileSync(this.cachePath, JSON.stringify(cacheData, null, 2));
      this.isDirty = false;
    } catch (error) {
      console.error("Error saving cache:", error);
    }
  }

  async get(key: string): Promise<string | null> {
    return this.cache.get(key) || null;
  }

  async set(key: string, value: string): Promise<void> {
    this.cache.set(key, value);
    this.isDirty = true;

    // Save every 10 operations to avoid too frequent writes
    if (this.cache.size % 10 === 0) {
      this.saveCache();
    }
  }

  async has(key: string): Promise<boolean> {
    return this.cache.has(key);
  }

  async clear(): Promise<void> {
    this.cache.clear();
    this.isDirty = true;
    this.saveCache();
  }

  async getStats(): Promise<{
    total: number;
    oldest: string | null;
    newest: string | null;
  }> {
    return {
      total: this.cache.size,
      oldest: null, // Not tracking timestamps in simple version
      newest: null
    };
  }

  close(): void {
    this.saveCache();
  }
}
