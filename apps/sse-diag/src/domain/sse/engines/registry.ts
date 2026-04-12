import type { SseEngineDescriptor } from '../engine';
import { PROTOTYPE_RULE_ENGINE_KEY, prototypeRuleEngineDescriptor } from './prototypeRuleEngine';

/** Default engine key used when no request is provided by the Viewer. */
export const DEFAULT_SSE_ENGINE_KEY = PROTOTYPE_RULE_ENGINE_KEY;

/** Local bundled engine descriptors (internal pluginability, not a host marketplace). */
export const SSE_ENGINE_DESCRIPTORS: SseEngineDescriptor[] = [
  prototypeRuleEngineDescriptor,
];
