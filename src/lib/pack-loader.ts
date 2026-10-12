import speciesData from '../../public/pack/species.json?raw';

export interface Species {
  id: string;
  commonNameEn: string;
  commonNameTa: string;
  scientificName: string;
  type: 'bird' | 'plant';
  factsEn: string[];
  factsTa: string[];
  safetyNoteEn: string;
  safetyNoteTa: string;
  identifyingFeatures: string[];
}

export async function loadSpecies(): Promise<Species[]> {
  try {
    return JSON.parse(speciesData) as Species[];
  } catch (e) {
    return [] as Species[];
  }
}

export async function getSpeciesById(id: string): Promise<Species | undefined> {
  const all = await loadSpecies();
  return all.find(s => s.id === id);
}
