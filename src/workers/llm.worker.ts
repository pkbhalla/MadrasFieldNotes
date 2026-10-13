import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator: any = null;
let initPromise: Promise<void> | null = null;

async function ensureLoaded(): Promise<void> {
  if (generator) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      generator = await pipeline(
        'text-generation',
        'onnx-community/Qwen2.5-0.5B-Instruct',
        {
          device: 'wasm' as any,
          dtype: 'q4' as any,
          numThreads: 1,
          progress_callback: (p: any) =>
            self.postMessage({ type: 'progress', data: p })
        } as any
      );
      self.postMessage({ type: 'init', success: true, model: 'Qwen2.5-0.5B-Instruct-q4' });
    } catch {
      try {
        generator = await pipeline(
          'text-generation',
          'onnx-community/SmolLM2-360M-Instruct',
          {
            device: 'wasm' as any,
            dtype: 'q4' as any,
            numThreads: 1,
            progress_callback: (p: any) =>
              self.postMessage({ type: 'progress', data: p })
          } as any
        );
        self.postMessage({ type: 'init', success: true, model: 'SmolLM2-360M-Instruct-q4' });
      } catch (err2) {
        self.postMessage({ type: 'init', success: false, error: String(err2) });
        throw err2;
      }
    }
  })();

  return initPromise;
}

async function doGenerate(data: any) {
  try {
    await ensureLoaded();
    const chatMessages = data.messages || data.systemPrompt;
    const output = await generator(chatMessages, {
      max_new_tokens: 96,
      do_sample: false,
      return_full_text: false
    });
    const text = output?.[0]?.generated_text ?? '';
    self.postMessage({ type: 'result', text });
  } catch (err) {
    self.postMessage({ type: 'error', error: String(err) });
  }
}

self.onmessage = async (e: MessageEvent) => {
  const { type } = e.data;

  if (type === 'init') {
    // Kick off loading but don't block; generate will await it
    ensureLoaded().catch(() => {});
  } else if (type === 'generate') {
    await doGenerate(e.data);
  }
};
