ROLE & CONTEXT
You are building "Madras Field Notes" — a fully offline, installable PWA that helps
someone outdoors in Chennai identify and learn about local birds and plants, in
English and Tamil, with zero network dependency after first load. Everything runs
in the browser: vision matching, LLM chat, and data. No backend. No API keys.
Target user: someone on a walk at IIT Madras campus or Pallikaranai marsh with
their phone in airplane mode.

HARD CONSTRAINTS
- Single framework: plain Vite + TypeScript (no heavy UI framework; keep bundle small)
- All AI via @huggingface/transformers v3 only (one inference stack)
- Total model weight budget: under 500 MB for full mode; identification-only
  fallback mode under 150 MB
- Must work: Chrome Android, airplane mode, first load online then fully offline
- All inference in Web Workers — never block the main thread
- Must call navigator.storage.persist() on first load; handle eviction by
  re-caching models on next online session

CORE FEATURES (in priority order — build in this order, each independently shippable)
1. PWA shell: VitePWA plugin, service worker precaching app shell; Cache API for
   model files; install prompt; a visible "offline-ready" indicator that polls
   navigator.onLine and cache state.
2. Species knowledge pack: /public/pack/species.json with 15 species common to
   IITM campus / Chennai wetlands (fill with: common myna, rose-ringed parakeet,
   spotted dove, house crow, white-throated kingfisher, Asian koel, neem, peepal,
   banyan, palash, hibiscus, jasmine, banana, coconut palm, bougainvillea).
   Each entry: id, commonNameEn, commonNameTa, scientificName, type (bird|plant),
   3 factsEn[], 3 factsTa[], safetyNoteEn, safetyNoteTa, identifyingFeatures[]
   (short phrases used as CLIP text prompts).
3. Identify screen: camera capture or gallery upload → transformers.js
   zero-shot-image-classification (model: Xenova/clip-vit-base-patch32,
   quantized) with candidate labels built from identifyingFeatures of all
   species → top-3 results with confidence bars. Below 0.35: show an honest
   "Not sure — closest guesses" state. Never claim certainty.
4. Species card: from pack only. Language toggle EN/தமிழ் switchable per card,
   persisted.
5. Ask screen (the local LLM): after a species is loaded, a chat panel using
   text-generation with onnx-community/gemma-3-1b-it-ONNX (WebGPU) with automatic
   fallback to onnx-community/Qwen2.5-0.5B-Instruct (WASM). System prompt injects
   the full species JSON and instructs: answer only from this data, decline
   edibility/medical questions, max 120 tokens, English only.
6. Field log: every identification saved to localStorage with timestamp and
   chosen species id; screen lists them; "Export JSON" button.
7. Capability screen on first load: detect navigator.gpu, deviceMemory, storage
   quota → route to full mode, identification-only mode, or unsupported message,
   each in plain friendly language.

NON-GOALS (explicitly do not build)
- No generative Tamil output, no accounts/sync, no maps, no microphone/audio,
  no fine-tuning, no telemetry.

FILE STRUCTURE
src/
  workers/vision.worker.ts, workers/llm.worker.ts
  lib/capabilities.ts, cache-manager.ts, pack-loader.ts, prompts.ts
  screens/Identify.tsx-equivalents as plain TS modules
  ui/ (minimal CSS, mobile-first, big tap targets)
public/pack/species.json

ACCEPTANCE CRITERIA (test each before calling done)
- Load site online on Android Chrome → toggle airplane mode → full identify →
  card → chat → works, zero failed requests in devtools
- Identify a rose-ringed parakeet and a neem leaf from photos displayed on a
  laptop screen; record confidence values
- WASM fallback: disable WebGPU via chrome://flags → identification still works
- Refresh with server off (file://-like offline) → app loads from cache
