import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, messages, systemPrompt } = e.data;

  if (type === 'init') {
    try {
      generator = await pipeline(
        'text-generation',
        'onnx-community/Qwen2.5-0.5B-Instruct',
        {
          device: 'wasm',
          dtype: 'q4',
          progress_callback: (p: any) =>
            self.postMessage({ type: 'progress', progress: p })
        }
      );
      self.postMessage({ type: 'init', success: true, model: 'Qwen2.5-0.5B-Instruct-q4' });
    } catch (err) {
      self.postMessage({ type: 'init', success: false, error: String(err) });
    }
  } else if (type === 'generate' && generator) {
    try {
      const input = messages || systemPrompt;
      const result = await generator(input, {
        max_new_tokens: 120,
        do_sample: false,
        return_full_text: false
      });
      self.postMessage({ type: 'result', result });
    } catch (err) {
      self.postMessage({ type: 'error', error: String(err) });
    }
  }
};
