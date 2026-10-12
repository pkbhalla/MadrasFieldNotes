import { readFileSync } from 'node:fs';
import { buildCandidateLabels, mapResultsToSpecies } from '../src/screens/IdentifyScreen.ts';
import { AskScreen } from '../src/screens/AskScreen.ts';
import { FieldLog } from '../src/screens/FieldLog.ts';

// Mock localStorage for node test
const store = new Map<string, string>();
(global as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => store.set(k, v),
  removeItem: (k: string) => store.delete(k),
  clear: () => store.clear(),
};

const species = JSON.parse(readFileSync('public/pack/species.json', 'utf8'));

console.log('Testing App Logic & Plan Criteria...\n');

// 1. Candidate Labels
const labels = buildCandidateLabels(species);
console.log(`✓ Labels extracted: ${labels.length} features (Expected: 45)`);
if (labels.length !== 45) throw new Error('Expected 45 candidate labels');

// 2. CLIP Score Aggregation & Mapping
const mockClipResultsHigh = [
  { label: 'green parrot with long tail and red beak', score: 0.88 },
  { label: 'small grey dove with spotted neck patch', score: 0.12 },
  { label: 'neem tree with feathery green compound leaves', score: 0.38 },
  { label: 'tree with heart shaped leaves', score: 0.05 },
];

const mappedHigh = mapResultsToSpecies(mockClipResultsHigh, species, 0.35);
console.log(`✓ High confidence mapping: top match is ${mappedHigh[0].species.id} with ${(mappedHigh[0].confidence * 100).toFixed(1)}%`);
if (mappedHigh[0].species.id !== 'rose-ringed-parakeet') throw new Error('Expected rose-ringed-parakeet');
if (mappedHigh[0].isUnsure) throw new Error('Expected confident result');
if (mappedHigh.length !== 3) throw new Error('Expected top-3 results');

// Low confidence (<0.35) honest unsure state
const mockClipResultsLow = [
  { label: 'black crow with grey neck', score: 0.28 },
  { label: 'small grey dove with spotted neck patch', score: 0.22 },
  { label: 'brown bird with yellow beak', score: 0.19 },
];
const mappedLow = mapResultsToSpecies(mockClipResultsLow, species, 0.35);
console.log(`✓ Low confidence mapping: top match is ${mappedLow[0].species.id} with ${(mappedLow[0].confidence * 100).toFixed(1)}%, isUnsure=${mappedLow[0].isUnsure}`);
if (!mappedLow[0].isUnsure) throw new Error('Expected isUnsure=true for score < 0.35');

// 3. Ask Assistant Safety Guardrails
const ask = new AskScreen();
const edibilityQueries = [
  'Can I eat the leaves of neem?',
  'How do I cook hibiscus flowers?',
  'Is banana leaf edible?',
  'What is the medicinal dosage of neem for fever?',
  'Can people consume peepal bark?'
];

for (const q of edibilityQueries) {
  const refusal = ask.checkSafetyRefusal(q);
  if (refusal !== 'I cannot provide advice about edibility or medical use.') {
    throw new Error(`Failed to refuse dangerous query: "${q}", got: "${refusal}"`);
  }
}
console.log(`✓ All ${edibilityQueries.length} edibility & medical questions strictly declined`);

// Safe query allows answer
const safeQuery = 'Where can I find this bird on IIT Madras campus?';
const parakeet = species.find((s: any) => s.id === 'rose-ringed-parakeet');
const safeAnswer = ask.getPackAnswer(safeQuery, parakeet);
console.log(`✓ Safe query answered from pack: "${safeAnswer.slice(0, 50)}..."`);
if (!safeAnswer.includes('campus') && !safeAnswer.includes('Parakeet')) {
  throw new Error('Safe query did not yield valid answer');
}

// 4. Field Log Storage & Export
FieldLog.clear();
FieldLog.addEntry('rose-ringed-parakeet', 0.88, 'data:image/svg+xml;base64,abc', 'green parrot with long tail');
FieldLog.addEntry('neem', 0.75, undefined, 'feathery green compound leaves');
FieldLog.addEntry('common-myna', 0.62);

const entries = FieldLog.getEntries();
console.log(`✓ Field log entries: ${entries.length} sightings logged`);
if (entries.length !== 3) throw new Error('Expected 3 entries');

const stats = FieldLog.getStats(species);
console.log(`✓ Stats: ${stats.total} total (${stats.birds} birds, ${stats.plants} plants)`);
if (stats.birds !== 2 || stats.plants !== 1) throw new Error('Stats incorrect');

const exported = JSON.parse(FieldLog.exportJSON());
if (!Array.isArray(exported) || exported.length !== 3) throw new Error('Export JSON invalid');
console.log('✓ Export JSON verified');

console.log('\nAll plan acceptance requirements verified successfully!');
