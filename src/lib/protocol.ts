/** Message protocol shared by the main thread and both workers. */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface ZeroShotResult {
  label: string;
  score: number;
}

export type VisionRequest = {
  id: string;
  type: 'classify';
  /** Structured-cloneable image data (already downscaled). */
  image: ImageData;
  labels: string[];
};

export type LlmRequest = {
  id: string;
  type: 'generate';
  messages: ChatMessage[];
};

export type WorkerRequest = VisionRequest | LlmRequest | { id: string; type: 'ping' };

export type WorkerReply =
  | { id: string; type: 'progress'; phase: 'download' | 'init' | 'infer'; pct: number; text?: string }
  | { id: string; type: 'vision-result'; results: ZeroShotResult[]; device: string; dtype: string }
  | { id: string; type: 'llm-result'; text: string; backend: string; device: string }
  | { id: string; type: 'pong' }
  | { id: string; type: 'error'; message: string };

export interface SpeciesScore {
  speciesIndex: number;
  score: number;
  matchedFeature: string;
}

/**
 * Aggregate per-feature CLIP scores to per-species scores.
 * A species' score is the max across its own identifying features —
 * the strongest phrase that matched.
 */
export function aggregateScores(
  results: ZeroShotResult[],
  labelToSpecies: Map<string, number>,
): SpeciesScore[] {
  const best = new Map<number, SpeciesScore>();
  for (const r of results) {
    const speciesIndex = labelToSpecies.get(r.label);
    if (speciesIndex === undefined) continue;
    const current = best.get(speciesIndex);
    if (!current || r.score > current.score) {
      best.set(speciesIndex, {
        speciesIndex,
        score: r.score,
        matchedFeature: r.label,
      });
    }
  }
  return [...best.values()].sort((a, b) => b.score - a.score);
}
