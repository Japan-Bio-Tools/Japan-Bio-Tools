import type { EngineResolutionMode, SseEngineInput, SseEngineOutput, SseEngineStage } from './types';

export interface SseEngine {
  compute(input: SseEngineInput): Promise<SseEngineOutput>;
}

export type SseEngineFactoryParams = Record<string, string | number | boolean | null | undefined>;

export type SseEngineDescriptor = {
  engine_key: string;
  engine_id: string;
  engine_name: string;
  engine_stage: SseEngineStage;
  create(params: SseEngineFactoryParams): SseEngine;
};

export type SseEngineRegistry = Map<string, SseEngineDescriptor>;

export type EngineResolutionResult = {
  requested_engine_key: string | null;
  resolved_engine_id: string | null;
  resolution_mode: EngineResolutionMode;
  descriptor: SseEngineDescriptor | null;
  error: string | null;
};

export function createSseEngineRegistry(descriptors: SseEngineDescriptor[]): SseEngineRegistry {
  const registry: SseEngineRegistry = new Map();
  for (const descriptor of descriptors) {
    registry.set(descriptor.engine_key, descriptor);
  }
  return registry;
}

export function resolveSseEngineDescriptor(
  registry: SseEngineRegistry,
  requestedEngineKey: string | null,
  defaultEngineKey: string
): EngineResolutionResult {
  if (requestedEngineKey) {
    const direct = registry.get(requestedEngineKey);
    if (!direct) {
      return {
        requested_engine_key: requestedEngineKey,
        resolved_engine_id: null,
        resolution_mode: 'failed_unknown_key',
        descriptor: null,
        error: `Unknown engine key: ${requestedEngineKey}`,
      };
    }
    return {
      requested_engine_key: requestedEngineKey,
      resolved_engine_id: direct.engine_id,
      resolution_mode: 'direct',
      descriptor: direct,
      error: null,
    };
  }

  const fallback = registry.get(defaultEngineKey) ?? null;
  if (!fallback) {
    return {
      requested_engine_key: null,
      resolved_engine_id: null,
      resolution_mode: 'failed_unknown_key',
      descriptor: null,
      error: `Default engine key not found: ${defaultEngineKey}`,
    };
  }

  return {
    requested_engine_key: null,
    resolved_engine_id: fallback.engine_id,
    resolution_mode: 'default_used',
    descriptor: fallback,
    error: null,
  };
}
