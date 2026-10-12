export interface DeviceCapabilities {
  hasWebGPU: boolean;
  hasWasm: boolean;
  deviceMemory?: number;
  storageQuota?: number;
  storageUsage?: number;
  storageAvailable?: number;
  isPersisted?: boolean;
}

export async function detectCapabilities(): Promise<DeviceCapabilities> {
  const caps: DeviceCapabilities = {
    hasWebGPU: 'gpu' in navigator,
    hasWasm: typeof WebAssembly === 'object'
  };

  const nav = navigator as any;
  if (nav.deviceMemory !== undefined) {
    caps.deviceMemory = nav.deviceMemory;
  }

  try {
    if (navigator.storage && navigator.storage.estimate) {
      const estimate = await navigator.storage.estimate();
      caps.storageQuota = estimate.quota;
      caps.storageUsage = estimate.usage;
      caps.storageAvailable = (estimate.quota || 0) - (estimate.usage || 0);
    }
  } catch (e) {
    console.warn('Storage estimate failed', e);
  }

  try {
    if (navigator.storage && navigator.storage.persisted) {
      caps.isPersisted = await navigator.storage.persisted();
    }
  } catch (e) {
    console.warn('Storage persisted check failed', e);
  }

  return caps;
}

export async function requestStoragePersistence(): Promise<boolean> {
  try {
    if (navigator.storage && navigator.storage.persist) {
      return await navigator.storage.persist();
    }
  } catch (e) {
    console.warn('Storage persist failed', e);
  }
  return false;
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || isNaN(bytes)) return 'Unknown';
  if (bytes < 1024) return bytes + ' B';
  const kb = bytes / 1024;
  if (kb < 1024) return kb.toFixed(1) + ' KB';
  const mb = kb / 1024;
  if (mb < 1024) return mb.toFixed(1) + ' MB';
  const gb = mb / 1024;
  return gb.toFixed(1) + ' GB';
}

