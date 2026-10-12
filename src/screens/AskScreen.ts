import type { Species } from '../lib/pack-loader';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export class AskScreen {
  private messages: ChatMessage[] = [];
  
  constructor() {}
  
  addMessage(role: 'user' | 'assistant', content: string): ChatMessage {
    const msg: ChatMessage = {
      role,
      content,
      timestamp: Date.now()
    };
    this.messages.push(msg);
    return msg;
  }
  
  getMessages(): ChatMessage[] {
    return this.messages;
  }
  
  clear() {
    this.messages = [];
  }

  /**
   * Strictly intercepts edibility or medicinal questions per PLAN.md safety requirements:
   * "decline edibility/medical questions, max 120 tokens, English only."
   */
  checkSafetyRefusal(query: string): string | null {
    const q = query.toLowerCase();
    const edibilityKeywords = [
      'edible', 'eat', 'eating', 'can i eat', 'cook', 'cooking', 'taste',
      'recipe', 'food', 'consumable', 'consume', 'medicine', 'medicinal',
      'cure', 'remedy', 'treat disease', 'healing', 'dosage', 'health benefit'
    ];
    for (const kw of edibilityKeywords) {
      if (new RegExp(`\\b${kw}\\b`, 'i').test(q)) {
        return "I cannot provide advice about edibility or medical use.";
      }
    }
    return null;
  }

  /**
   * Provides verified answers directly from the species knowledge pack
   * as an instant, zero-latency response or WASM fallback.
   */
  getPackAnswer(query: string, species: Species): string {
    const q = query.toLowerCase();

    // Check safety first
    const refusal = this.checkSafetyRefusal(query);
    if (refusal) return refusal;

    // Identifying / appearance
    if (q.includes('look') || q.includes('feature') || q.includes('color') || q.includes('identify') || q.includes('appearance')) {
      return `Key features for ${species.commonNameEn}: ${species.identifyingFeatures.join(', ')}.`;
    }

    // Safety / danger
    if (q.includes('safe') || q.includes('danger') || q.includes('bite') || q.includes('harm') || q.includes('touch')) {
      return `${species.safetyNoteEn}`;
    }

    // Facts / habits / location
    if (q.includes('where') || q.includes('habitat') || q.includes('live') || q.includes('nest') || q.includes('found')) {
      const locFact = species.factsEn.find(f => f.toLowerCase().includes('campus') || f.toLowerCase().includes('common') || f.toLowerCase().includes('iit'));
      if (locFact) return locFact;
      return `${species.commonNameEn} is found around IIT Madras campus and Chennai green spaces. ${species.factsEn[0]}`;
    }

    // Default: give verified fact
    return `From field notes on ${species.commonNameEn}: ${species.factsEn.join('. ')}`;
  }
}

