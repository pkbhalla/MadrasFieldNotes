/** Validates public/pack/species.json against the plan's schema. */
import { readFileSync } from 'node:fs';

const REQUIRED_IDS = [
  'common-myna',
  'rose-ringed-parakeet',
  'spotted-dove',
  'house-crow',
  'white-throated-kingfisher',
  'asian-koel',
  'neem',
  'peepal',
  'banyan',
  'palash',
  'hibiscus',
  'jasmine',
  'banana',
  'coconut-palm',
  'bougainvillea',
];

const pack = JSON.parse(readFileSync('public/pack/species.json', 'utf8'));
const errors = [];

if (!Array.isArray(pack)) errors.push('pack is not an array');
if (pack.length !== 15) errors.push(`expected 15 species, got ${pack.length}`);

const ids = new Set();
for (let i = 0; i < pack.length; i++) {
  const s = pack[i];
  const tag = `[${i}] ${s.id ?? '(no id)'}`;
  const fields = [
    'id', 'commonNameEn', 'commonNameTa', 'scientificName', 'type',
    'factsEn', 'factsTa', 'safetyNoteEn', 'safetyNoteTa', 'identifyingFeatures',
  ];
  for (const field of fields) {
    if (!(field in s)) errors.push(`${tag}: missing ${field}`);
  }
  if (s.type && !['bird', 'plant'].includes(s.type)) errors.push(`${tag}: bad type ${s.type}`);
  for (const f of ['factsEn', 'factsTa', 'identifyingFeatures']) {
    if (!Array.isArray(s[f]) || s[f].length === 0) errors.push(`${tag}: ${f} must be a non-empty array`);
  }
  if (Array.isArray(s.factsEn) && s.factsEn.length !== 3) errors.push(`${tag}: factsEn must have exactly 3`);
  if (Array.isArray(s.factsTa) && s.factsTa.length !== 3) errors.push(`${tag}: factsTa must have exactly 3`);
  if (ids.has(s.id)) errors.push(`${tag}: duplicate id`);
  ids.add(s.id);
  // Tamil fields must contain Tamil script (guards against machine-translation slip)
  if (typeof s.commonNameTa === 'string' && !/[\u0B80-\u0BFF]/.test(s.commonNameTa)) {
    errors.push(`${tag}: commonNameTa has no Tamil script`);
  }
  if (Array.isArray(s.factsTa)) {
    s.factsTa.forEach((f, j) => {
      if (!/[\u0B80-\u0BFF]/.test(f)) errors.push(`${tag}: factsTa[${j}] has no Tamil script`);
    });
  }
}

for (const id of REQUIRED_IDS) {
  if (!ids.has(id)) errors.push(`missing required species: ${id}`);
}

if (errors.length > 0) {
  console.error('species.json validation FAILED:');
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

const birds = pack.filter((s) => s.type === 'bird').length;
const plants = pack.filter((s) => s.type === 'plant').length;
const features = pack.reduce((n, s) => n + s.identifyingFeatures.length, 0);
console.log(`OK pack valid: ${pack.length} species (${birds} birds, ${plants} plants), ${features} CLIP labels`);
