import type { Species } from './pack-loader';

export function buildSpeciesContext(species: Species[]): string {
  return JSON.stringify(species, null, 2);
}

export function getSystemPrompt(species: Species[]): string {
  const context = buildSpeciesContext(species);
  return `You are a helpful field assistant for Madras Field Notes. Answer only from the data below.

CONSTRAINTS:
- Answer ONLY from the provided data. If not found, say "I don't have that information in my field notes."
- Decline edibility, medicinal, or medical questions. Say "I cannot provide advice about edibility or medical use."
- Max 90 tokens. English only.

Data:
${context}`;
}
