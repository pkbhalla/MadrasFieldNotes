import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let classifier: any = null;
let activeDevice: string = 'unknown';

async function initClassifier(): Promise<void> {
  if (classifier) return;

  try {
    self.postMessage({ type: 'status', message: 'Loading Vision AI (CLIP)...' });
    classifier = await pipeline(
      'zero-shot-image-classification',
      'Xenova/clip-vit-base-patch32',
      {
        device: 'wasm' as any,
        dtype: 'q8' as any
      }
    );
    activeDevice = 'wasm';
    self.postMessage({ type: 'init', success: true, device: 'wasm' });
    return;
  } catch (err: any) {
    console.error('Vision pipeline initialization failed:', err);
    self.postMessage({ type: 'init', success: false, error: err?.message || String(err) });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type, image, labels, id } = e.data;

  if (type === 'init') {
    await initClassifier();
  } else if (type === 'classify') {
    try {
      if (!classifier) {
        await initClassifier();
      }
      if (!classifier) {
        throw new Error('Vision classifier could not be loaded.');
      }
      self.postMessage({ type: 'status', message: 'Analyzing image...' });
      const results = await classifier(image, labels);
      self.postMessage({
        type: 'result',
        id,
        results: Array.isArray(results) ? results : [results],
        device: activeDevice
      });
    } catch (err: any) {
      console.error('Classification error:', err);
      self.postMessage({
        type: 'error',
        id,
        error: err?.message || String(err)
      });
    }
  }
};
