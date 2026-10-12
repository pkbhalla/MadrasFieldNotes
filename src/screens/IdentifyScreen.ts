import type { Species } from '../lib/pack-loader';

export interface IdentifyResult {
  species: Species;
  confidence: number;
  matchedFeature: string;
  isUnsure: boolean;
}

export function buildCandidateLabels(species: Species[]): string[] {
  const labels: string[] = [];
  for (const s of species) {
    for (const f of s.identifyingFeatures) {
      if (!labels.includes(f)) {
        labels.push(f);
      }
    }
  }
  return labels;
}

/**
 * Aggregates CLIP zero-shot feature scores up to species level.
 * Each species gets the maximum score among its own identifying features.
 * Returns top 3 species sorted by confidence.
 * Threshold is 0.35 as specified in PLAN.md.
 */
export function mapResultsToSpecies(
  results: Array<{ label: string; score: number }>,
  species: Species[],
  threshold: number = 0.35
): IdentifyResult[] {
  if (!results || results.length === 0 || !species || species.length === 0) {
    return [];
  }

  // Map label to score
  const scoreByLabel = new Map<string, number>();
  for (const r of results) {
    if (r && typeof r.label === 'string' && typeof r.score === 'number') {
      scoreByLabel.set(r.label.toLowerCase().trim(), r.score);
    }
  }

  // Calculate best score for each species
  const speciesScores: Array<{
    species: Species;
    maxScore: number;
    bestFeature: string;
  }> = [];

  for (const s of species) {
    let maxScore = 0;
    let bestFeature = s.identifyingFeatures[0] || '';

    for (const feature of s.identifyingFeatures) {
      const featLower = feature.toLowerCase().trim();
      let score = scoreByLabel.get(featLower);

      if (score === undefined) {
        // Fallback: check if any label contains this feature or vice versa
        for (const [lbl, sc] of scoreByLabel.entries()) {
          if (lbl.includes(featLower) || featLower.includes(lbl)) {
            score = sc;
            break;
          }
        }
      }

      if (score !== undefined && score > maxScore) {
        maxScore = score;
        bestFeature = feature;
      }
    }

    speciesScores.push({
      species: s,
      maxScore,
      bestFeature
    });
  }

  // Sort descending by score
  speciesScores.sort((a, b) => b.maxScore - a.maxScore);

  // Return top 3 results
  return speciesScores.slice(0, 3).map(item => ({
    species: item.species,
    confidence: item.maxScore,
    matchedFeature: item.bestFeature,
    isUnsure: item.maxScore < threshold
  }));
}

