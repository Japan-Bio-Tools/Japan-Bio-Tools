import type { SseEngineDescriptor } from '../engine';
import {
  DSSP_EXPLICIT_ENGINE_KEY,
  dsspExplicitEngineDescriptor,
} from './dsspExplicitEngine';
import { pseaV1EngineDescriptor } from './pseaEngine';
import { PROTOTYPE_RULE_ENGINE_KEY, prototypeRuleEngineDescriptor } from './prototypeRuleEngine';
import { STRIDE_V1_ENGINE_KEY, strideV1EngineDescriptor } from './strideEngine';

/** Default engine key used when no request is provided by the Viewer. */
export const DEFAULT_SSE_ENGINE_KEY = DSSP_EXPLICIT_ENGINE_KEY;

/** 候補。切替ゲートを満たすまでは既定値へ自動昇格しない。 */
export const DEFAULT_OVERRIDE_CANDIDATE_ENGINE_KEY = STRIDE_V1_ENGINE_KEY;

/** Local bundled engine descriptors (internal pluginability, not a host marketplace). */
export const SSE_ENGINE_DESCRIPTORS: SseEngineDescriptor[] = [
  dsspExplicitEngineDescriptor,
  strideV1EngineDescriptor,
  pseaV1EngineDescriptor,
  prototypeRuleEngineDescriptor,
];

export const PROTOTYPE_ENGINE_KEY = PROTOTYPE_RULE_ENGINE_KEY;
