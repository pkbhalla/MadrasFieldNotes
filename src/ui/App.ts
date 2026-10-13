import type { Species } from '../lib/pack-loader';
import { loadSpecies } from '../lib/pack-loader';
import { requestStoragePersistence, isMobileDevice } from '../lib/capabilities';
import { CacheManager } from '../lib/cache-manager';
import { FieldLog } from '../screens/FieldLog';
import { SpeciesCard, renderSpeciesCatalog } from '../screens/SpeciesCard';
import { mapResultsToSpecies, buildCandidateLabels, type IdentifyResult } from '../screens/IdentifyScreen';
import { AskScreen } from '../screens/AskScreen';
import { checkCapabilities, renderCapabilityCard, type CapabilityResult } from '../screens/CapabilityScreen';
import { getSystemPrompt } from '../lib/prompts';
import './styles.css';

type Screen = 'identify' | 'species' | 'ask' | 'log' | 'capability';

export class App {
  private currentScreen: Screen = 'identify';
  private species: Species[] = [];
  private selectedSpecies: Species | null = null;
  private visionWorker: Worker | null = null;
  private llmWorker: Worker | null = null;
  private isOnline: boolean = navigator.onLine;
  private preferredLang: 'en' | 'ta' = (localStorage.getItem('preferred-lang') as 'en' | 'ta') || 'en';
  
  // UI and State
  private catalogFilter: 'all' | 'bird' | 'plant' = 'all';
  private catalogSearch: string = '';
  private currentImagePreview: string | null = null;
  private cameraStream: MediaStream | null = null;
  private isCameraActive: boolean = false;
  private cameraFacing: 'environment' | 'user' = 'environment';
  private isAnalyzing: boolean = false;
  private analysisStatus: string = '';
  private analysisProgressPct: number = 0;
  private identifyResults: IdentifyResult[] = [];
  private askScreen: AskScreen = new AskScreen();
  private isGeneratingChat: boolean = false;
  private llmBackend: string = 'loading';
  private deferredInstallPrompt: any = null;
  private capabilityResult: CapabilityResult | null = null;
  private isOfflineCached: boolean = false;

  constructor() {
    this.init();
  }

  private async init() {
    this.setupInstallPrompt();
    await this.loadSpeciesData();
    await this.setupCapabilities();
    await this.setupPWAStorage();
    this.setupOfflinePoller();
    // Workers initialized lazily
    // Set backend label based on device
    this.llmBackend = isMobileDevice() ? 'Field Notes (offline)' : 'loading';

    // On mobile, clear bloated LLM cache from previous attempts
    if (isMobileDevice()) {
      CacheManager.getInstance().clearLlmCache().catch(() => {});
    }

    // Check first load experience
    const hasSeenOnboarding = localStorage.getItem('mnf-seen-onboarding');
    if (!hasSeenOnboarding) {
      this.currentScreen = 'capability';
    }

    this.render();
  }

  private async loadSpeciesData() {
    this.species = await loadSpecies();
    if (this.species.length > 0 && !this.selectedSpecies) {
      this.selectedSpecies = this.species[0];
    }
  }

  private setupInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      this.renderHeader();
    });

    window.addEventListener('appinstalled', () => {
      this.deferredInstallPrompt = null;
      this.showToast('Madras Field Notes installed successfully!');
      this.renderHeader();
    });
  }

  private async setupCapabilities() {
    try {
      this.capabilityResult = await checkCapabilities();
    } catch (e) {
      console.warn('Capability check error', e);
    }
  }

  private async setupPWAStorage() {
    try {
      await requestStoragePersistence();
    } catch (e) {
      console.warn('Storage persistence call failed', e);
    }
  }

  private setupOfflinePoller() {
    const update = async () => {
      this.isOnline = navigator.onLine;
      const status = await CacheManager.getInstance().getCacheStatus();
      this.isOfflineCached = status.isOfflineReady || !this.isOnline;
      this.renderStatusPill();
    };

    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    window.setInterval(update, 5000);
    update();
  }

  private async ensureVisionWorker() {
    if (this.visionWorker) return this.visionWorker;
    try {
      this.visionWorker = new Worker(new URL('../workers/vision.worker.ts', import.meta.url), { type: 'module' });
      this.visionWorker.onmessage = (e) => {
        this.handleVisionWorkerMessage(e.data);
      };
      this.visionWorker.postMessage({ type: 'init' });
    } catch (e) {
      console.warn('Vision worker init failed', e);
    }
    return this.visionWorker;
  }

  private async ensureLlmWorker() {
    // On mobile, skip LLM entirely — use pack-based answers to avoid OOM crash
    if (isMobileDevice()) return null;
    if (this.llmWorker) return this.llmWorker;
    try {
      this.llmWorker = new Worker(new URL('../workers/llm.worker.ts', import.meta.url), { type: 'module' });
      this.llmWorker.onmessage = (e) => {
        this.handleLlmWorkerMessage(e.data);
      };
      this.llmWorker.postMessage({ type: 'init' });
    } catch (e) {
      console.warn('LLM worker init failed', e);
    }
    return this.llmWorker;
  }

  private handleVisionWorkerMessage(data: any) {
    const { type, results, message, error } = data;

    if (type === 'progress' && data.data) {
      const p = data.data;
      if (p.progress) {
        this.analysisProgressPct = Math.round(p.progress);
        this.analysisStatus = `Downloading Vision AI: ${this.analysisProgressPct}%`;
      } else if (p.status) {
        this.analysisStatus = `Vision model: ${p.status}`;
      }
      this.updateIdentifyScreenLive();
    } else if (type === 'status') {
      this.analysisStatus = message || '';
      this.updateIdentifyScreenLive();
    } else if (type === 'result') {
      this.isAnalyzing = false;
      this.analysisStatus = '';
      this.analysisProgressPct = 0;
      
      const mapped = mapResultsToSpecies(results, this.species, 0.35);
      this.identifyResults = mapped;

      if (mapped.length > 0) {
        const top = mapped[0];
        this.selectedSpecies = top.species;
        // Auto-save sighting to Field Log
        FieldLog.addEntry(
          top.species.id,
          top.confidence,
          this.currentImagePreview || undefined,
          top.matchedFeature
        );
      }

      this.render();
      this.showToast('Species identified and saved to Field Log!');
    } else if (type === 'error') {
      this.isAnalyzing = false;
      this.analysisStatus = '';
      this.showToast('Identification error: ' + (error || 'Please try another photo.'));
      this.render();
    }
  }

  private handleLlmWorkerMessage(data: any) {
    const { type, text, model, device, error } = data;

    if (type === 'init' && data.success) {
      this.llmBackend = `${model?.split('/')[1] || 'LLM'} (${device || 'ready'})`;
      this.updateChatHeaderLive();
    } else if (type === 'progress' && data.data) {
      const p = data.data;
      if (p.progress) {
        this.llmBackend = `Downloading AI: ${Math.round(p.progress)}%`;
      }
      this.updateChatHeaderLive();
    } else if (type === 'status') {
      // Status update during generation
    } else if (type === 'result') {
      this.isGeneratingChat = false;
      const cleanText = (text || '').trim();
      this.askScreen.addMessage('assistant', cleanText || "I don't have that information in my field notes.");
      this.renderChatMessages();
    } else if (type === 'error') {
      this.isGeneratingChat = false;
      if (error) console.warn('LLM worker error:', error);
      // Fallback to Knowledge Pack Answer on worker error
      if (this.selectedSpecies) {
        const msgs = this.askScreen.getMessages();
        const lastUser = msgs.filter(m => m.role === 'user').pop();
        if (lastUser) {
          const fallbackAns = this.askScreen.getPackAnswer(lastUser.content, this.selectedSpecies);
          this.askScreen.addMessage('assistant', fallbackAns);
        }
      }
      this.renderChatMessages();
    }
  }

  // =========================================================================
  // Rendering System
  // =========================================================================

  private render() {
    const appEl = document.getElementById('app');
    if (!appEl) return;

    appEl.innerHTML = `
      <div class="app-container">
        <header class="app-header" id="app-header">
          ${this.getHeaderHtml()}
        </header>

        <main class="content-area" id="main-content">
          ${this.getScreenHtml()}
        </main>

        <nav class="bottom-nav">
          <button class="nav-button ${this.currentScreen === 'identify' ? 'active' : ''}" data-nav="identify">
            <span class="nav-icon">📸</span>
            <span>Identify</span>
          </button>
          <button class="nav-button ${this.currentScreen === 'species' ? 'active' : ''}" data-nav="species">
            <span class="nav-icon">🌿</span>
            <span>Species</span>
          </button>
          <button class="nav-button ${this.currentScreen === 'ask' ? 'active' : ''}" data-nav="ask">
            <span class="nav-icon">💬</span>
            <span>Ask AI</span>
          </button>
          <button class="nav-button ${this.currentScreen === 'log' ? 'active' : ''}" data-nav="log">
            <span class="nav-icon">📋</span>
            <span>Field Log</span>
          </button>
          <button class="nav-button ${this.currentScreen === 'capability' ? 'active' : ''}" data-nav="capability">
            <span class="nav-icon">⚙️</span>
            <span>Status</span>
          </button>
        </nav>
      </div>
    `;

    this.attachEvents();
  }

  private getHeaderHtml(): string {
    const isTa = this.preferredLang === 'ta';
    return `
      <div class="header-top">
        <div class="brand-group" id="btn-brand-home">
          <img src="/icons/icon.svg" class="app-logo" alt="Logo">
          <div class="brand-text">
            <h1>Madras Field Notes</h1>
            <div class="subheading">சென்னை களக் குறிப்புகள் • IIT Madras</div>
          </div>
        </div>

        <div class="header-actions">
          <div id="status-pill" class="status-pill" title="Network & Offline Cache status">
            <span class="status-dot ${this.isOnline ? 'online' : 'offline'}"></span>
            <span id="status-pill-text">${this.getStatusPillText()}</span>
          </div>

          ${this.deferredInstallPrompt ? `
            <button id="btn-install-app" class="btn-header-install">
              📲 ${isTa ? 'நிறுவ' : 'Install'}
            </button>
          ` : ''}

          <div class="lang-toggle-pills">
            <button data-global-lang="en" class="pill-btn ${!isTa ? 'active' : ''}">EN</button>
            <button data-global-lang="ta" class="pill-btn ${isTa ? 'active' : ''}">தமிழ்</button>
          </div>
        </div>
      </div>
    `;
  }

  private getStatusPillText(): string {
    if (!this.isOnline) return 'Offline Ready';
    if (this.isOfflineCached) return 'Online • Cached';
    return 'Online';
  }

  private renderHeader() {
    const h = document.getElementById('app-header');
    if (h) h.innerHTML = this.getHeaderHtml();
    this.attachHeaderEvents();
  }

  private renderStatusPill() {
    const textEl = document.getElementById('status-pill-text');
    const pillEl = document.getElementById('status-pill');
    if (textEl) textEl.textContent = this.getStatusPillText();
    if (pillEl) {
      const dot = pillEl.querySelector('.status-dot');
      if (dot) {
        dot.className = `status-dot ${this.isOnline ? 'online' : 'offline'}`;
      }
    }
  }

  private getScreenHtml(): string {
    switch (this.currentScreen) {
      case 'identify':
        return this.renderIdentifyScreen();
      case 'species':
        return this.renderSpeciesScreen();
      case 'ask':
        return this.renderAskScreen();
      case 'log':
        return this.renderLogScreen();
      case 'capability':
        return this.renderCapabilityScreen();
      default:
        return this.renderIdentifyScreen();
    }
  }

  // =========================================================================
  // Screen 1: Identify View
  // =========================================================================

  private renderIdentifyScreen(): string {
    const isTa = this.preferredLang === 'ta';

    return `
      <div class="identify-view">
        <div class="identify-hero">
          <h2>${isTa ? 'பறவைகள் மற்றும் தாவரங்கள் கண்டறிதல்' : 'Identify Birds & Plants'}</h2>
          <p class="muted small">${isTa ? 'முழுவதும் இணையம் இன்றி உங்கள் சாதனத்தில் இயங்கும் AI' : '100% offline vision AI running privately in your browser'}</p>
        </div>

        ${this.isCameraActive ? `
          <div class="camera-viewfinder-card">
            <video id="camera-preview" class="camera-preview" autoplay playsinline></video>
            <div class="camera-controls-overlay">
              <button id="btn-camera-flip" class="btn-camera-util">🔄 Flip</button>
              <button id="btn-camera-shutter" class="btn-shutter" title="Take Photo"></button>
              <button id="btn-camera-close" class="btn-camera-util">✕ Close</button>
            </div>
          </div>
        ` : `
          <div class="capture-options-grid">
            <div id="btn-open-camera" class="capture-card-btn">
              <div class="capture-card-icon">📸</div>
              <strong>${isTa ? 'கேமரா திறக்க' : 'Take Photo'}</strong>
              <span>${isTa ? 'நேரடி கேமரா' : 'Use device camera'}</span>
            </div>

            <label for="upload-image-input" class="capture-card-btn">
              <div class="capture-card-icon">🖼️</div>
              <strong>${isTa ? 'கேலரி' : 'Choose Photo'}</strong>
              <span>${isTa ? 'படக் கோப்பு' : 'Upload from device'}</span>
              <input type="file" id="upload-image-input" accept="image/*" style="display: none;">
            </label>
          </div>
        `}

        <canvas id="offscreen-canvas" style="display: none;"></canvas>

        <!-- Sample Photos Quick Bar -->
        <div class="samples-tray">
          <div class="samples-tray-title">
            <h3>${isTa ? 'சோதனை மாதிரிகள் (Try Instant Samples)' : '🧪 Quick Test Samples'}</h3>
            <span class="muted small">1-tap demo</span>
          </div>
          <div class="sample-chips-row">
            <button class="sample-chip" data-sample="parakeet">
              <span class="sample-chip-icon">🦜</span>
              <div class="sample-chip-text">
                <strong>Parakeet</strong>
                <span>Rose-ringed</span>
              </div>
            </button>
            <button class="sample-chip" data-sample="neem">
              <span class="sample-chip-icon">🍃</span>
              <div class="sample-chip-text">
                <strong>Neem Leaf</strong>
                <span>வேப்பம்</span>
              </div>
            </button>
            <button class="sample-chip" data-sample="kingfisher">
              <span class="sample-chip-icon">🐦</span>
              <div class="sample-chip-text">
                <strong>Kingfisher</strong>
                <span>நீலம்பொருவி</span>
              </div>
            </button>
            <button class="sample-chip" data-sample="myna">
              <span class="sample-chip-icon">🐤</span>
              <div class="sample-chip-text">
                <strong>Common Myna</strong>
                <span>சாத்தைக்குருவி</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Preview of uploaded/captured image -->
        ${this.currentImagePreview ? `
          <div class="preview-card">
            <img src="${this.currentImagePreview}" class="preview-img" alt="Captured photo">
            <div class="preview-bar">
              <span class="small muted">Photo ready for offline AI</span>
              <button id="btn-re-identify" class="btn btn-primary btn-sm">⚡ Re-analyze</button>
            </div>
          </div>
        ` : ''}

        <!-- Analysis Progress Box -->
        ${this.isAnalyzing ? `
          <div class="card progress-card">
            <div class="spinner"></div>
            <strong>${this.analysisStatus || (isTa ? 'படம் பகுப்பாய்வு செய்யப்படுகிறது...' : 'Analyzing photo with Vision AI...')}</strong>
            ${this.analysisProgressPct > 0 ? `
              <div class="progress-track">
                <div class="progress-fill" style="width: ${this.analysisProgressPct}%;"></div>
              </div>
              <span class="small muted">${this.analysisProgressPct}%</span>
            ` : `
              <p class="small muted">Comparing image against 15 local Chennai species...</p>
            `}
          </div>
        ` : ''}

        <!-- Identification Top-3 Results -->
        ${this.identifyResults.length > 0 ? `
          <div class="results-section">
            <h3>${isTa ? 'கண்டறியப்பட்ட முடிவுகள்' : 'Identification Results'}</h3>

            ${this.identifyResults[0]?.isUnsure ? `
              <div class="unsure-warning-banner">
                <span class="warning-icon">⚠️</span>
                <div>
                  <strong>${isTa ? 'உறுதிப்படுத்த முடியவில்லை — மிக நெருக்கமான யூகங்கள்' : 'Not sure — closest guesses'}</strong>
                  <p>${isTa ? 'நம்பகத்தன்மை 35% க்கும் குறைவாக உள்ளது. சிறந்த ஒத்த இனங்கள் கீழே காட்டப்பட்டுள்ளன.' : 'Top confidence is below 35%. Honest closest matches shown below — verify with field notes.'}</p>
                </div>
              </div>
            ` : ''}

            ${this.identifyResults.map((r, idx) => {
              const sp = r.species;
              const isBird = sp.type === 'bird';
              const name = isTa ? sp.commonNameTa : sp.commonNameEn;
              const subName = isTa ? sp.commonNameEn : sp.commonNameTa;
              const pct = (r.confidence * 100).toFixed(1);
              const confClass = r.confidence >= 0.5 ? 'high' : r.confidence >= 0.35 ? 'medium' : 'low';

              return `
                <div class="result-item-card">
                  <div class="result-item-top">
                    <div class="result-name-col">
                      <div class="species-badge-row">
                        <span class="badge ${isBird ? 'badge-bird' : 'badge-plant'}">${isBird ? '🐦 Bird' : '🌿 Plant'}</span>
                        <span class="badge-subtle">Match #${idx + 1}</span>
                      </div>
                      <h4>${name}</h4>
                      <div class="tamil-subname">${subName} • <em>${sp.scientificName}</em></div>
                    </div>
                    <div class="result-pct-badge ${confClass}">
                      ${pct}%
                    </div>
                  </div>

                  <div class="conf-track">
                    <div class="conf-fill ${confClass}" style="width: ${pct}%;"></div>
                  </div>

                  <div class="matched-feature-hint">
                    🔍 Matched feature: <em>"${r.matchedFeature}"</em>
                  </div>

                  <div class="result-actions-row">
                    <button class="btn btn-secondary btn-sm btn-view-result-card" data-species-id="${sp.id}">
                      📖 ${isTa ? 'குறிப்புகள்' : 'Field Card'}
                    </button>
                    <button class="btn btn-ghost btn-sm btn-ask-result" data-species-id="${sp.id}">
                      💬 ${isTa ? 'கேளுங்கள்' : 'Ask AI'}
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  private updateIdentifyScreenLive() {
    if (this.currentScreen === 'identify') {
      const pCard = document.querySelector('.progress-card');
      if (pCard) {
        pCard.innerHTML = `
          <div class="spinner"></div>
          <strong>${this.analysisStatus}</strong>
          ${this.analysisProgressPct > 0 ? `
            <div class="progress-track">
              <div class="progress-fill" style="width: ${this.analysisProgressPct}%;"></div>
            </div>
            <span class="small muted">${this.analysisProgressPct}%</span>
          ` : ''}
        `;
      }
    }
  }

  // =========================================================================
  // Screen 2: Species Catalog & Details View
  // =========================================================================

  private renderSpeciesScreen(): string {
    if (this.selectedSpecies) {
      const card = new SpeciesCard(this.selectedSpecies, this.preferredLang);
      return card.render();
    }

    return renderSpeciesCatalog(
      this.species,
      this.preferredLang,
      this.catalogFilter,
      this.catalogSearch
    );
  }

  // =========================================================================
  // Screen 3: Ask Assistant (Chat) View
  // =========================================================================

  private renderAskScreen(): string {
    const isTa = this.preferredLang === 'ta';
    const msgs = this.askScreen.getMessages();

    return `
      <div class="ask-view">
        <div class="card ask-header-card">
          <div class="species-picker-row">
            <label for="ask-species-select" class="small muted">
              <strong>${isTa ? 'பொருள்:' : 'Subject:'}</strong>
            </label>
            <select id="ask-species-select" class="species-picker-select">
              ${this.species.map(s => `
                <option value="${s.id}" ${this.selectedSpecies?.id === s.id ? 'selected' : ''}>
                  ${s.type === 'bird' ? '🐦' : '🌿'} ${isTa ? s.commonNameTa : s.commonNameEn} (${s.scientificName})
                </option>
              `).join('')}
            </select>
          </div>

          <div class="catalog-card-header">
            <span class="model-badge" id="llm-model-badge">
              ⚡ Local AI: ${this.llmBackend}
            </span>
            <button id="btn-clear-chat" class="btn btn-ghost btn-sm" title="Clear chat history">Clear</button>
          </div>

          <!-- Quick Questions Tray -->
          <div class="prompt-chips-tray">
            <div class="prompt-chips-scroll">
              <button class="prompt-chip" data-prompt="What are its key identifying features?">
                🔍 Key features?
              </button>
              <button class="prompt-chip" data-prompt="Where is it found in Chennai and IIT Madras?">
                📍 Where found?
              </button>
              <button class="prompt-chip" data-prompt="Is it safe to approach or touch?">
                ⚠️ Safe around people?
              </button>
              <button class="prompt-chip" data-prompt="Can I eat or consume this?">
                🍴 Can I eat it?
              </button>
            </div>
          </div>
        </div>

        <!-- Chat Conversation Messages -->
        <div class="chat-container" id="chat-messages-container">
          ${msgs.length === 0 ? `
            <div class="bubble-system">
              👋 Ask any question about ${this.selectedSpecies ? this.selectedSpecies.commonNameEn : 'this species'}.
              ${isMobileDevice()
                ? 'Answers come directly from verified field notes — no AI download needed.'
                : 'Answers are generated locally from verified field notes with strict safety guardrails.'}
            </div>
          ` : msgs.map(m => `
            <div class="chat-bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-assistant'}">
              ${escapeHtml(m.content)}
            </div>
          `).join('')}

          ${this.isGeneratingChat ? `
            <div class="chat-bubble bubble-assistant">
              <div class="typing-dots">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
              </div>
            </div>
          ` : ''}
        </div>

        <!-- Chat Input Bar -->
        <div class="chat-input-bar">
          <input type="text" id="chat-input" class="chat-input-field" placeholder="${isTa ? 'இனத்தைப் பற்றி கேளுங்கள்...' : 'Ask about this species...'}" ${this.isGeneratingChat ? 'disabled' : ''}>
          <button id="btn-send-chat" class="btn btn-primary" ${this.isGeneratingChat ? 'disabled' : ''}>
            ${isTa ? 'அனுப்பு' : 'Send'}
          </button>
        </div>
      </div>
    `;
  }

  private updateChatHeaderLive() {
    const el = document.getElementById('llm-model-badge');
    if (el) {
      const label = isMobileDevice() ? 'Field Notes' : this.llmBackend;
      el.textContent = `⚡ Local AI: ${label}`;
    }
  }

  private renderChatMessages() {
    const container = document.getElementById('chat-messages-container');
    if (!container) {
      this.render();
      return;
    }
    const msgs = this.askScreen.getMessages();
    container.innerHTML = `
      ${msgs.length === 0 ? `
        <div class="bubble-system">
          Ask any question about ${this.selectedSpecies ? this.selectedSpecies.commonNameEn : 'this species'}.
        </div>
      ` : msgs.map(m => `
        <div class="chat-bubble ${m.role === 'user' ? 'bubble-user' : 'bubble-assistant'}">
          ${escapeHtml(m.content)}
        </div>
      `).join('')}

      ${this.isGeneratingChat ? `
        <div class="chat-bubble bubble-assistant">
          <div class="typing-dots">
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
            <span class="typing-dot"></span>
          </div>
        </div>
      ` : ''}
    `;
    container.scrollTop = container.scrollHeight;
  }

  // =========================================================================
  // Screen 4: Field Log View
  // =========================================================================

  private renderLogScreen(): string {
    const isTa = this.preferredLang === 'ta';
    const entries = FieldLog.getEntries();
    const stats = FieldLog.getStats(this.species);

    return `
      <div class="log-view">
        <div class="card">
          <div class="log-header-stats">
            <div class="stat-box">
              <strong>${stats.total}</strong>
              <span>${isTa ? 'மொத்த பதிவுகள்' : 'Total Sightings'}</span>
            </div>
            <div class="stat-box">
              <strong>${stats.birds}</strong>
              <span>${isTa ? 'பறவைகள்' : 'Birds Logged'}</span>
            </div>
            <div class="stat-box">
              <strong>${stats.plants}</strong>
              <span>${isTa ? 'தாவரங்கள்' : 'Plants Logged'}</span>
            </div>
          </div>

          <div class="log-toolbar">
            <button id="btn-export-log-json" class="btn btn-secondary btn-sm">
              📥 ${isTa ? 'JSON ஏற்றுமதி' : 'Export JSON'}
            </button>
            ${entries.length > 0 ? `
              <button id="btn-clear-log" class="btn btn-ghost btn-sm btn-danger">
                🗑️ ${isTa ? 'அழி' : 'Clear All'}
              </button>
            ` : ''}
          </div>
        </div>

        ${entries.length === 0 ? `
          <div class="empty-state card">
            <span class="empty-icon">📝</span>
            <p><strong>${isTa ? 'பதிவுகள் எதுவும் இல்லை' : 'No sightings recorded yet'}</strong></p>
            <p class="muted small">${isTa ? 'பறவைகள் அல்லது தாவரங்களை படம் பிடித்து கண்டறியவும்.' : 'Use the Identify screen to capture and log sightings outdoors.'}</p>
            <button id="btn-go-identify" class="btn btn-primary" style="margin-top: 10px;">
              📸 ${isTa ? 'கண்டறிதலுக்கு செல்' : 'Start Identifying'}
            </button>
          </div>
        ` : `
          <div class="log-list">
            ${entries.slice().reverse().map(e => {
              const sp = this.species.find(s => s.id === e.speciesId);
              const isBird = sp ? sp.type === 'bird' : false;
              const name = sp ? (isTa ? sp.commonNameTa : sp.commonNameEn) : e.speciesId;
              const dateStr = new Date(e.timestamp).toLocaleString(undefined, {
                month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
              });

              return `
                <div class="log-item-card card" data-log-species-id="${e.speciesId}">
                  <div class="log-thumb-wrap">
                    ${e.thumbnail ? `
                      <img src="${e.thumbnail}" alt="Thumbnail">
                    ` : `
                      <span class="log-thumb-icon">${isBird ? '🐦' : '🌿'}</span>
                    `}
                  </div>

                  <div class="log-info">
                    <h4 class="log-species-name">${name}</h4>
                    <div class="log-date-text">
                      ${dateStr}
                      ${e.confidence ? ` • <strong>${(e.confidence * 100).toFixed(0)}%</strong> match` : ''}
                    </div>
                  </div>

                  <div class="log-actions">
                    <button class="btn btn-ghost btn-sm btn-open-log-species" data-species-id="${e.speciesId}">
                      →
                    </button>
                    <button class="btn btn-ghost btn-sm btn-delete-log" data-log-id="${e.id}" title="Delete">
                      ✕
                    </button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `}
      </div>
    `;
  }

  // =========================================================================
  // Screen 5: Device Capabilities & Onboarding View
  // =========================================================================

  private renderCapabilityScreen(): string {
    if (!this.capabilityResult) {
      return '<div class="card"><p>Detecting device capabilities...</p></div>';
    }
    const hasSeen = Boolean(localStorage.getItem('mnf-seen-onboarding'));
    return renderCapabilityCard(this.capabilityResult, !hasSeen);
  }

  // =========================================================================
  // Event Attachments & Interactions
  // =========================================================================

  private attachEvents() {
    this.attachHeaderEvents();

    // Bottom Navigation
    document.querySelectorAll('.nav-button').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.getAttribute('data-nav') as Screen;
        if (target) {
          this.stopCamera();
          this.currentScreen = target;
          this.render();
        }
      });
    });

    // Screen-specific event listeners
    if (this.currentScreen === 'identify') {
      this.attachIdentifyEvents();
    } else if (this.currentScreen === 'species') {
      this.attachSpeciesEvents();
    } else if (this.currentScreen === 'ask') {
      this.attachAskEvents();
    } else if (this.currentScreen === 'log') {
      this.attachLogEvents();
    } else if (this.currentScreen === 'capability') {
      this.attachCapabilityEvents();
    }
  }

  private attachHeaderEvents() {
    // Brand home
    const brand = document.getElementById('btn-brand-home');
    if (brand) {
      brand.addEventListener('click', () => {
        this.stopCamera();
        this.currentScreen = 'identify';
        this.render();
      });
    }

    // Status pill -> opens Capability screen
    const pill = document.getElementById('status-pill');
    if (pill) {
      pill.addEventListener('click', () => {
        this.stopCamera();
        this.currentScreen = 'capability';
        this.render();
      });
    }

    // Install button
    const installBtn = document.getElementById('btn-install-app');
    if (installBtn && this.deferredInstallPrompt) {
      installBtn.addEventListener('click', async () => {
        this.deferredInstallPrompt.prompt();
        const outcome = await this.deferredInstallPrompt.userChoice;
        if (outcome.outcome === 'accepted') {
          this.deferredInstallPrompt = null;
          this.renderHeader();
        }
      });
    }

    // Global Language Toggle
    document.querySelectorAll('[data-global-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-global-lang') as 'en' | 'ta';
        if (lang) {
          this.preferredLang = lang;
          localStorage.setItem('preferred-lang', lang);
          this.render();
        }
      });
    });
  }

  private attachIdentifyEvents() {
    // Camera trigger
    const openCam = document.getElementById('btn-open-camera');
    if (openCam) openCam.addEventListener('click', () => this.startCamera());

    // File input
    const fileIn = document.getElementById('upload-image-input') as HTMLInputElement;
    if (fileIn) {
      fileIn.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.files && target.files[0]) {
          this.processImageFile(target.files[0]);
        }
      });
    }

    // Camera viewfinder controls
    const shutter = document.getElementById('btn-camera-shutter');
    if (shutter) shutter.addEventListener('click', () => this.captureCameraFrame());

    const flipCam = document.getElementById('btn-camera-flip');
    if (flipCam) {
      flipCam.addEventListener('click', () => {
        this.cameraFacing = this.cameraFacing === 'environment' ? 'user' : 'environment';
        this.startCamera();
      });
    }

    const closeCam = document.getElementById('btn-camera-close');
    if (closeCam) closeCam.addEventListener('click', () => this.stopCamera());

    // Re-identify
    const reIdentify = document.getElementById('btn-re-identify');
    if (reIdentify && this.currentImagePreview) {
      reIdentify.addEventListener('click', () => this.runVisionClassification(this.currentImagePreview!));
    }

    // Sample chips
    document.querySelectorAll('[data-sample]').forEach(btn => {
      btn.addEventListener('click', () => {
        const sampleKey = btn.getAttribute('data-sample');
        this.loadSampleImage(sampleKey);
      });
    });

    // Result card actions
    document.querySelectorAll('.btn-view-result-card').forEach(btn => {
      btn.addEventListener('click', () => {
        const spId = btn.getAttribute('data-species-id');
        const s = this.species.find(sp => sp.id === spId);
        if (s) {
          this.selectedSpecies = s;
          this.currentScreen = 'species';
          this.render();
        }
      });
    });

    document.querySelectorAll('.btn-ask-result').forEach(btn => {
      btn.addEventListener('click', () => {
        const spId = btn.getAttribute('data-species-id');
        const s = this.species.find(sp => sp.id === spId);
        if (s) {
          this.selectedSpecies = s;
          this.currentScreen = 'ask';
          this.render();
        }
      });
    });
  }

  private attachSpeciesEvents() {
    // Back to catalog
    const backBtn = document.getElementById('btn-back-catalog');
    if (backBtn) {
      backBtn.addEventListener('click', () => {
        this.selectedSpecies = null;
        this.render();
      });
    }

    // Language toggle in species card
    document.querySelectorAll('.lang-toggle-pills [data-lang]').forEach(btn => {
      btn.addEventListener('click', () => {
        const lang = btn.getAttribute('data-lang') as 'en' | 'ta';
        if (lang) {
          this.preferredLang = lang;
          localStorage.setItem('preferred-lang', lang);
          this.render();
        }
      });
    });

    // Ask button in card
    document.querySelectorAll('.btn-species-ask').forEach(btn => {
      btn.addEventListener('click', () => {
        const spId = btn.getAttribute('data-species-id');
        const s = this.species.find(sp => sp.id === spId);
        if (s) {
          this.selectedSpecies = s;
          this.currentScreen = 'ask';
          this.render();
        }
      });
    });

    // Log button in card
    document.querySelectorAll('.btn-species-log').forEach(btn => {
      btn.addEventListener('click', () => {
        const spId = btn.getAttribute('data-species-id');
        if (spId) {
          FieldLog.addEntry(spId, 1.0);
          this.showToast('Logged sighting in your field journal!');
        }
      });
    });

    // Catalog card click
    document.querySelectorAll('.catalog-card').forEach(card => {
      card.addEventListener('click', () => {
        const spId = card.getAttribute('data-species-id');
        const s = this.species.find(sp => sp.id === spId);
        if (s) {
          this.selectedSpecies = s;
          this.render();
        }
      });
    });

    // Catalog filter chips
    document.querySelectorAll('.filter-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const f = btn.getAttribute('data-filter') as 'all' | 'bird' | 'plant';
        if (f) {
          this.catalogFilter = f;
          this.render();
        }
      });
    });

    // Search input
    const searchIn = document.getElementById('species-search-input') as HTMLInputElement;
    if (searchIn) {
      searchIn.addEventListener('input', (e) => {
        this.catalogSearch = (e.target as HTMLInputElement).value;
        const grid = document.querySelector('.catalog-grid');
        if (grid) {
          grid.outerHTML = renderSpeciesCatalog(
            this.species,
            this.preferredLang,
            this.catalogFilter,
            this.catalogSearch
          );
          this.attachSpeciesEvents();
        }
      });
    }

    const clearSearch = document.getElementById('btn-clear-search');
    if (clearSearch) {
      clearSearch.addEventListener('click', () => {
        this.catalogSearch = '';
        this.render();
      });
    }
  }

  private attachAskEvents() {
    // Species selector dropdown
    const select = document.getElementById('ask-species-select') as HTMLSelectElement;
    if (select) {
      select.addEventListener('change', () => {
        const s = this.species.find(sp => sp.id === select.value);
        if (s) {
          this.selectedSpecies = s;
          this.askScreen.clear();
          this.render();
        }
      });
    }

    // Clear chat
    const clearBtn = document.getElementById('btn-clear-chat');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        this.askScreen.clear();
        this.renderChatMessages();
      });
    }

    // Prompt chips
    document.querySelectorAll('.prompt-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        const prompt = btn.getAttribute('data-prompt');
        if (prompt) {
          this.sendChatMessage(prompt);
        }
      });
    });

    // Send button & enter key
    const sendBtn = document.getElementById('btn-send-chat');
    const input = document.getElementById('chat-input') as HTMLInputElement;

    const doSend = () => {
      if (input && input.value.trim() && !this.isGeneratingChat) {
        const text = input.value.trim();
        input.value = '';
        this.sendChatMessage(text);
      }
    };

    if (sendBtn) sendBtn.addEventListener('click', doSend);
    if (input) {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') doSend();
      });
    }
  }

  private attachLogEvents() {
    // Export JSON
    const exportBtn = document.getElementById('btn-export-log-json');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const data = FieldLog.exportJSON();
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `madras-field-notes-sightings-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Field notes log exported!');
      });
    }

    // Clear Log
    const clearLogBtn = document.getElementById('btn-clear-log');
    if (clearLogBtn) {
      clearLogBtn.addEventListener('click', () => {
        if (confirm('Clear all logged sightings from this device?')) {
          FieldLog.clear();
          this.render();
          this.showToast('Log cleared.');
        }
      });
    }

    // Go identify
    const goId = document.getElementById('btn-go-identify');
    if (goId) {
      goId.addEventListener('click', () => {
        this.currentScreen = 'identify';
        this.render();
      });
    }

    // Open species from log
    document.querySelectorAll('.btn-open-log-species').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const spId = btn.getAttribute('data-species-id');
        const s = this.species.find(sp => sp.id === spId);
        if (s) {
          this.selectedSpecies = s;
          this.currentScreen = 'species';
          this.render();
        }
      });
    });

    // Delete single log entry
    document.querySelectorAll('.btn-delete-log').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const logId = btn.getAttribute('data-log-id');
        if (logId) {
          FieldLog.removeEntry(logId);
          this.render();
        }
      });
    });
  }

  private attachCapabilityEvents() {
    const startBtn = document.getElementById('btn-start-exploring');
    if (startBtn) {
      startBtn.addEventListener('click', () => {
        localStorage.setItem('mnf-seen-onboarding', 'true');
        this.currentScreen = 'identify';
        this.render();
      });
    }

    const persistBtn = document.getElementById('btn-request-persist');
    if (persistBtn) {
      persistBtn.addEventListener('click', async () => {
        const granted = await requestStoragePersistence();
        if (granted) {
          this.showToast('Permanent storage granted by browser!');
          this.capabilityResult = await checkCapabilities();
          this.render();
        } else {
          this.showToast('Storage permission could not be updated.');
        }
      });
    }
  }

  // =========================================================================
  // Camera & Image Processing Operations
  // =========================================================================

  private async startCamera() {
    try {
      this.stopCamera();
      const constraints: MediaStreamConstraints = {
        video: {
          facingMode: { ideal: this.cameraFacing },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };

      this.cameraStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.isCameraActive = true;
      this.render();

      const video = document.getElementById('camera-preview') as HTMLVideoElement;
      if (video) {
        video.srcObject = this.cameraStream;
        await video.play().catch(() => {});
      }
    } catch (err) {
      this.isCameraActive = false;
      this.showToast('Camera error: ' + (err as any)?.message || 'Please allow camera permission.');
      this.render();
    }
  }

  private stopCamera() {
    if (this.cameraStream) {
      this.cameraStream.getTracks().forEach(t => t.stop());
      this.cameraStream = null;
    }
    this.isCameraActive = false;
  }

  private captureCameraFrame() {
    const video = document.getElementById('camera-preview') as HTMLVideoElement;
    if (!video) return;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);

    this.stopCamera();
    this.currentImagePreview = dataUrl;
    this.runVisionClassification(dataUrl);
  }

  private async processImageFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      this.currentImagePreview = dataUrl;
      this.runVisionClassification(dataUrl);
    };
    reader.readAsDataURL(file);
  }

  private async loadSampleImage(sampleKey: string | null) {
    if (!sampleKey) return;
    const path = `/samples/${sampleKey}.svg`;

    try {
      this.isAnalyzing = true;
      this.analysisStatus = `Loading sample: ${sampleKey}...`;
      this.render();

      // Convert SVG to clean raster dataURL
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const target = 224;
        canvas.width = target;
        canvas.height = target;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, target, target);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          this.currentImagePreview = dataUrl;
          this.runVisionClassification(dataUrl);
        }
      };
      img.onerror = () => {
        this.isAnalyzing = false;
        this.showToast('Could not load sample photo.');
        this.render();
      };
      img.src = path;
    } catch (e) {
      this.isAnalyzing = false;
      this.render();
    }
  }

  private async runVisionClassification(dataUrl: string) {
    const worker = await this.ensureVisionWorker();
    if (!worker) {
      this.showToast('Vision AI failed to load. Try again.');
      this.isAnalyzing = false;
      this.render();
      return;
    }

    this.isAnalyzing = true;
    this.analysisStatus = 'Preparing candidate features...';
    this.analysisProgressPct = 0;
    this.identifyResults = [];
    this.render();

    const candidateLabels = buildCandidateLabels(this.species);

    worker.postMessage({
      type: 'classify',
      image: dataUrl,
      labels: candidateLabels,
      id: 'req_' + Date.now()
    });
  }

  // =========================================================================
  // Chat & LLM Operations
  // =========================================================================

  private async sendChatMessage(question: string) {
    if (!this.selectedSpecies) return;

    // 1. Add user message
    this.askScreen.addMessage('user', question);
    this.isGeneratingChat = true;
    this.renderChatMessages();

    // 2. Strict Safety check per PLAN.md
    const refusal = this.askScreen.checkSafetyRefusal(question);
    if (refusal) {
      setTimeout(() => {
        this.isGeneratingChat = false;
        this.askScreen.addMessage('assistant', refusal);
        this.renderChatMessages();
      }, 300);
      return;
    }

    // 3. Lazy init LLM worker on demand
    const llmWorker = await this.ensureLlmWorker();
    if (llmWorker) {
      const systemPrompt = getSystemPrompt([this.selectedSpecies]);
      llmWorker.postMessage({
        type: 'generate',
        id: 'msg_' + Date.now(),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Species context: ${this.selectedSpecies.commonNameEn} (${this.selectedSpecies.scientificName}). Question: ${question}` }
        ]
      });
    } else {
      // Instant pack fallback
      setTimeout(() => {
        this.isGeneratingChat = false;
        const answer = this.askScreen.getPackAnswer(question, this.selectedSpecies!);
        this.askScreen.addMessage('assistant', answer);
        this.renderChatMessages();
      }, 500);
    }
  }

  // =========================================================================
  // Toast Helper
  // =========================================================================

  private showToast(msg: string) {
    const existing = document.querySelector('.toast-notice');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.className = 'toast-notice';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2600);
  }
}

function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
