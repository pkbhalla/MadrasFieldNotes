import type { Species } from '../lib/pack-loader';

export class SpeciesCard {
  private species: Species;
  private lang: 'en' | 'ta' = 'en';

  constructor(species: Species, lang: 'en' | 'ta' = 'en') {
    this.species = species;
    this.lang = lang;
  }

  render(): string {
    const isTa = this.lang === 'ta';
    const primaryName = isTa ? this.species.commonNameTa : this.species.commonNameEn;
    const secondaryName = isTa ? this.species.commonNameEn : this.species.commonNameTa;
    const sciName = this.species.scientificName;
    const facts = isTa ? this.species.factsTa : this.species.factsEn;
    const safety = isTa ? this.species.safetyNoteTa : this.species.safetyNoteEn;
    const isBird = this.species.type === 'bird';
    const typeLabel = isBird ? (isTa ? 'பறவை' : 'Bird') : (isTa ? 'தாவரம்' : 'Plant');
    const icon = isBird ? '🐦' : '🌿';

    return `
      <div class="card species-card">
        <div class="species-header-row">
          <button id="btn-back-catalog" class="btn btn-ghost btn-sm" title="Back to list">
            ← ${isTa ? 'பட்டியலுக்கு திரும்பு' : 'All Species'}
          </button>
          <div class="lang-toggle-pills">
            <button data-lang="en" class="pill-btn ${!isTa ? 'active' : ''}">English</button>
            <button data-lang="ta" class="pill-btn ${isTa ? 'active' : ''}">தமிழ்</button>
          </div>
        </div>

        <div class="species-title-area">
          <div class="species-avatar ${isBird ? 'avatar-bird' : 'avatar-plant'}">
            <span>${icon}</span>
          </div>
          <div class="species-headings">
            <div class="species-badge-row">
              <span class="badge ${isBird ? 'badge-bird' : 'badge-plant'}">${icon} ${typeLabel}</span>
              <span class="badge-subtle">IIT Madras & Chennai</span>
            </div>
            <h2 class="species-title">${escapeHtml(primaryName)}</h2>
            <div class="species-subtitle">${escapeHtml(secondaryName)} • <em class="scientific">${escapeHtml(sciName)}</em></div>
          </div>
        </div>

        <div class="section-divider"></div>

        <div class="species-features">
          <h4>🔍 ${isTa ? 'அடையாளக் குறிகள்' : 'Key Identifying Features'}</h4>
          <div class="features-chips">
            ${this.species.identifyingFeatures.map(feat => `
              <span class="feature-chip">${escapeHtml(feat)}</span>
            `).join('')}
          </div>
        </div>

        <div class="species-facts-block">
          <h4>📖 ${isTa ? 'முக்கிய உண்மைகள்' : 'Field Notes & Facts'}</h4>
          <ul class="facts-list">
            ${facts.map(f => `<li><span class="fact-bullet">•</span> ${escapeHtml(f)}</li>`).join('')}
          </ul>
        </div>

        <div class="safety-alert">
          <div class="safety-icon">⚠️</div>
          <div class="safety-body">
            <strong>${isTa ? 'பாதுகாப்பு & நடத்தை குறிப்பு' : 'Outdoor Field Advisory'}</strong>
            <p>${escapeHtml(safety)}</p>
          </div>
        </div>

        <div class="species-actions">
          <button class="btn btn-primary btn-species-ask" data-species-id="${this.species.id}">
            💬 ${isTa ? 'இதைப் பற்றி கேளுங்கள்' : 'Ask AI Assistant'}
          </button>
          <button class="btn btn-secondary btn-species-log" data-species-id="${this.species.id}">
            📝 ${isTa ? 'களப்பதிவில் சேர்க்க' : 'Log Sighting'}
          </button>
        </div>
      </div>
    `;
  }

  setLang(lang: 'en' | 'ta') {
    this.lang = lang;
    localStorage.setItem('preferred-lang', lang);
  }

  getLang(): 'en' | 'ta' {
    return this.lang;
  }
}

export function renderSpeciesCatalog(
  speciesList: Species[],
  selectedLang: 'en' | 'ta',
  activeTypeFilter: 'all' | 'bird' | 'plant' = 'all',
  searchQuery: string = ''
): string {
  const isTa = selectedLang === 'ta';
  const q = searchQuery.toLowerCase().trim();

  const filtered = speciesList.filter(s => {
    if (activeTypeFilter !== 'all' && s.type !== activeTypeFilter) return false;
    if (q) {
      const matchEn = s.commonNameEn.toLowerCase().includes(q);
      const matchTa = s.commonNameTa.includes(q);
      const matchSci = s.scientificName.toLowerCase().includes(q);
      return matchEn || matchTa || matchSci;
    }
    return true;
  });

  const birdCount = speciesList.filter(s => s.type === 'bird').length;
  const plantCount = speciesList.filter(s => s.type === 'plant').length;

  return `
    <div class="catalog-view">
      <div class="catalog-header card">
        <div class="catalog-title-row">
          <div>
            <h2>${isTa ? 'சென்னை இயற்கை வழிகாட்டி' : 'Species Knowledge Field Guide'}</h2>
            <p class="muted small">${isTa ? '15 உள்ளூர் பறவைகள் மற்றும் தாவரங்கள்' : '15 native birds and flora of IIT Madras & wetlands'}</p>
          </div>
          <div class="lang-toggle-pills">
            <button data-lang="en" class="pill-btn ${!isTa ? 'active' : ''}">EN</button>
            <button data-lang="ta" class="pill-btn ${isTa ? 'active' : ''}">தமிழ்</button>
          </div>
        </div>

        <div class="search-box">
          <span class="search-icon">🔍</span>
          <input type="text" id="species-search-input" placeholder="${isTa ? 'பெயர் அல்லது அறிவியல் பெயர் தேடுக...' : 'Search by English, Tamil, or scientific name...'}" value="${escapeHtml(searchQuery)}">
          ${searchQuery ? `<button id="btn-clear-search" class="clear-search-btn">✕</button>` : ''}
        </div>

        <div class="filter-chips">
          <button class="filter-chip ${activeTypeFilter === 'all' ? 'active' : ''}" data-filter="all">
            ${isTa ? 'அனைத்தும்' : 'All'} (${speciesList.length})
          </button>
          <button class="filter-chip ${activeTypeFilter === 'bird' ? 'active' : ''}" data-filter="bird">
            🐦 ${isTa ? 'பறவைகள்' : 'Birds'} (${birdCount})
          </button>
          <button class="filter-chip ${activeTypeFilter === 'plant' ? 'active' : ''}" data-filter="plant">
            🌿 ${isTa ? 'தாவரங்கள்' : 'Plants'} (${plantCount})
          </button>
        </div>
      </div>

      <div class="catalog-grid">
        ${filtered.length === 0 ? `
          <div class="empty-state card">
            <span class="empty-icon">🍃</span>
            <p><strong>${isTa ? 'இனங்கள் எதுவும் பொருந்தவில்லை' : 'No species found'}</strong></p>
            <p class="muted small">${isTa ? 'வேறு தேடல் சொல்லை முயற்சிக்கவும்' : 'Try a different search term or clear the filter.'}</p>
          </div>
        ` : filtered.map(s => {
          const isBird = s.type === 'bird';
          const title = isTa ? s.commonNameTa : s.commonNameEn;
          const sub = isTa ? s.commonNameEn : s.commonNameTa;
          const firstFact = isTa ? s.factsTa[0] : s.factsEn[0];
          return `
            <div class="catalog-card card" data-species-id="${s.id}">
              <div class="catalog-card-header">
                <span class="badge ${isBird ? 'badge-bird' : 'badge-plant'}">${isBird ? '🐦 Bird' : '🌿 Plant'}</span>
                <span class="open-arrow">→</span>
              </div>
              <h3 class="catalog-name">${escapeHtml(title)}</h3>
              <div class="catalog-subname">${escapeHtml(sub)} • <em>${escapeHtml(s.scientificName)}</em></div>
              <p class="catalog-snippet">${escapeHtml(firstFact)}</p>
              <div class="catalog-card-footer">
                <span class="view-details-link">${isTa ? 'விவரங்களைக் காண்க' : 'View Full Notes'}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}

function escapeHtml(text: string): string {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

