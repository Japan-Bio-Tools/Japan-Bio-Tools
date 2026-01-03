import type { SseEngineInput, SseEngineOutput } from './types';

export interface SseEngine {
  compute(input: SseEngineInput): Promise<SseEngineOutput>;
}
