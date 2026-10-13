export class CacheManager {
  private static instance: CacheManager;

  static getInstance(): CacheManager {
    if (!this.instance) {
      this.instance = new CacheManager();
    }
    return this.instance;
  }

  async cacheModel(_modelId: string, urls: string[]): Promise<void> {
    if (!('caches' in window)) return;
    const cache = await caches.open('huggingface-models');
    await Promise.all(urls.map(url => cache.add(url).catch(() => {})));
  }

  async isModelCached(modelKeyword: string): Promise<boolean> {
    if (!('caches' in window)) return false;
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          if (req.url.toLowerCase().includes(modelKeyword.toLowerCase())) {
            return true;
          }
        }
      }
    } catch (e) {
      console.warn('Cache check failed', e);
    }
    return false;
  }

  async getCacheStatus(): Promise<{
    isOfflineReady: boolean;
    hasVisionModel: boolean;
    hasLlmModel: boolean;
    cachedFilesCount: number;
  }> {
    if (!('caches' in window)) {
      return { isOfflineReady: false, hasVisionModel: false, hasLlmModel: false, cachedFilesCount: 0 };
    }
    try {
      let totalFiles = 0;
      let hasVision = false;
      let hasLlm = false;
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        totalFiles += keys.length;
        for (const req of keys) {
          const u = req.url.toLowerCase();
          if (u.includes('clip') || u.includes('xenova')) hasVision = true;
          if (u.includes('gemma') || u.includes('qwen')) hasLlm = true;
        }
      }
      return {
        isOfflineReady: totalFiles > 0,
        hasVisionModel: hasVision,
        hasLlmModel: hasLlm,
        cachedFilesCount: totalFiles
      };
    } catch (e) {
      return { isOfflineReady: false, hasVisionModel: false, hasLlmModel: false, cachedFilesCount: 0 };
    }
  }

  async clearStaleCache(): Promise<void> {
    if (!('caches' in window)) return;
    const keys = await caches.keys();
    await Promise.all(keys.map(k => caches.delete(k)));
  }

  /** Clear only LLM model caches (Qwen/Gemma), keep vision (CLIP). */
  async clearLlmCache(): Promise<void> {
    if (!('caches' in window)) return;
    try {
      const cacheNames = await caches.keys();
      for (const name of cacheNames) {
        const cache = await caches.open(name);
        const keys = await cache.keys();
        for (const req of keys) {
          const u = req.url.toLowerCase();
          if (u.includes('qwen') || u.includes('gemma') || u.includes('smollm')) {
            await cache.delete(req);
          }
        }
      }
    } catch (e) {
      console.warn('LLM cache clear failed', e);
    }
  }
}
