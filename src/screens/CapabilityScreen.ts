import { detectCapabilities, formatBytes } from '../lib/capabilities';
import { CacheManager } from '../lib/cache-manager';

export interface CapabilityResult {
  mode: 'full' | 'id-only' | 'unsupported';
  title: string;
  message: string;
  details: {
    webgpu: boolean;
    wasm: boolean;
    memoryGb?: number;
    quotaText: string;
    persisted: boolean;
    cacheReady: boolean;
  };
}

export async function checkCapabilities(): Promise<CapabilityResult> {
  const caps = await detectCapabilities();
  const cacheStatus = await CacheManager.getInstance().getCacheStatus();
  const persisted = caps.isPersisted ?? false;
  const memory = caps.deviceMemory;

  const details = {
    webgpu: caps.hasWebGPU,
    wasm: caps.hasWasm,
    memoryGb: memory,
    quotaText: caps.storageQuota ? `${formatBytes(caps.storageUsage)} used of ${formatBytes(caps.storageQuota)}` : 'Available',
    persisted,
    cacheReady: cacheStatus.isOfflineReady
  };

  if (!caps.hasWasm) {
    return {
      mode: 'unsupported',
      title: 'Browser Not Supported',
      message: 'Your browser is missing WebAssembly support required for offline AI. Please open this app in modern Chrome or Edge on Android.',
      details
    };
  }

  if (caps.hasWebGPU && (memory === undefined || memory >= 2)) {
    return {
      mode: 'full',
      title: 'Full Acceleration Mode (WebGPU)',
      message: 'Your device supports fast hardware-accelerated Vision AI and the Gemma-3 local LLM outdoor assistant with zero internet.',
      details
    };
  }

  return {
    mode: 'id-only',
    title: 'Offline Standard Mode (WebAssembly)',
    message: 'Your device runs in lightweight offline mode. Fast CLIP Vision identification and Qwen local AI run smoothly via WebAssembly.',
    details
  };
}

export function renderCapabilityCard(result: CapabilityResult, isFirstLoad: boolean = false): string {
  const isFull = result.mode === 'full';
  const isUnsup = result.mode === 'unsupported';

  return `
    <div class="card capability-card">
      <div class="cap-header">
        <div class="cap-icon-circle ${isFull ? 'cap-ok' : isUnsup ? 'cap-bad' : 'cap-warn'}">
          ${isFull ? '⚡' : isUnsup ? '⚠️' : '🌱'}
        </div>
        <div>
          <span class="badge ${isFull ? 'badge-full' : 'badge-wasm'}">${isFull ? 'High Performance' : 'Standard Offline'}</span>
          <h2 class="cap-title">${result.title}</h2>
          <p class="muted small">${result.message}</p>
        </div>
      </div>

      <div class="section-divider"></div>

      <h4 class="cap-section-head">Device Diagnostics</h4>
      <div class="diagnostics-list">
        <div class="diag-item">
          <div class="diag-icon">${result.details.webgpu ? '✅' : 'ℹ️'}</div>
          <div class="diag-text">
            <strong>Graphics Acceleration (WebGPU)</strong>
            <span>${result.details.webgpu ? 'Supported & Enabled (Fast GPU inference)' : 'Standard CPU WebAssembly mode (Battery-friendly)'}</span>
          </div>
        </div>

        <div class="diag-item">
          <div class="diag-icon">${result.details.wasm ? '✅' : '❌'}</div>
          <div class="diag-text">
            <strong>Offline Inference Engine (WASM)</strong>
            <span>${result.details.wasm ? 'Supported (Runs CLIP & Qwen without internet)' : 'Not available'}</span>
          </div>
        </div>

        <div class="diag-item">
          <div class="diag-icon">${result.details.persisted ? '✅' : '💾'}</div>
          <div class="diag-text">
            <strong>Permanent Offline Storage</strong>
            <span>${result.details.persisted ? 'Persistent (Protected from Android OS eviction)' : 'Standard storage — models will stay in browser cache'}</span>
          </div>
        </div>

        <div class="diag-item">
          <div class="diag-icon">📱</div>
          <div class="diag-text">
            <strong>Device Memory & Storage</strong>
            <span>${result.details.memoryGb ? result.details.memoryGb + ' GB RAM • ' : ''}Storage: ${result.details.quotaText}</span>
          </div>
        </div>

        <div class="diag-item">
          <div class="diag-icon">${navigator.onLine ? '🌐' : '📴'}</div>
          <div class="diag-text">
            <strong>Network Status</strong>
            <span>${navigator.onLine ? 'Online — models download on first scan, then ready for Airplane mode' : 'Offline / Airplane Mode Active'}</span>
          </div>
        </div>
      </div>

      ${!result.details.persisted ? `
        <div class="storage-prompt-banner">
          <p class="small">Tap below to give permission so Android will never clear your offline bird and plant models when space is tight.</p>
          <button id="btn-request-persist" class="btn btn-secondary btn-sm">🔒 Lock Storage for Offline Use</button>
        </div>
      ` : ''}

      <div class="cap-actions">
        <button id="btn-start-exploring" class="btn btn-primary btn-big">
          ${isFirstLoad ? '🌿 Start Exploring Campus' : '← Back to Field Guide'}
        </button>
      </div>
    </div>
  `;
}

