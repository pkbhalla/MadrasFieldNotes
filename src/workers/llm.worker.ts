import { pipeline, env } from '@huggingface/transformers';

env.allowLocalModels = false;
env.useBrowserCache = true;

let generator: any = null;

self.onmessage = async (e: MessageEvent) => {
  const { type, model, messages, systemPrompt } = e.data;

  if (type === 'init') {
    try {
      const firstModel = model || 'onnx-community/gemma-3-1b-it-ONNX';
      generator = await pipeline(
        'text-generation',
        firstModel,
        { device: 'cpu' as any }
      );
      self.postMessage({ type: 'init', success: true, fallback: 'cpu', model: firstModel });
    } catch (err) {
      try {
        const fallbackModel = 'onnx-community/Qwen2.5-0.5B-Instruct';
        generator = await pipeline(
          'text-generation',
          fallbackModel,
          { device: 'cpu' as any }
        );
        self.postMessage({ type: 'init', success: true, fallback: 'cpu', model: fallbackModel });
      } catch (err2) {
        self.postMessage({ type: 'init', success: false, error: err2 });
      }
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
      self.postMessage({ type: 'error', error: err });
    }
  }
};
