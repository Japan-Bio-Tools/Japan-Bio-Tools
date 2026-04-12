import type { SseEngineDescriptor } from '../engine';
import { PROTOTYPE_RULE_ENGINE_KEY, prototypeRuleEngineDescriptor } from './prototypeRuleEngine';

export const DEFAULT_SSE_ENGINE_KEY = PROTOTYPE_RULE_ENGINE_KEY;

export const SSE_ENGINE_DESCRIPTORS: SseEngineDescriptor[] = [
  prototypeRuleEngineDescriptor,
];
