import type { SseLabel } from '../types';
import { createKnownMethodStubDescriptor } from './knownMethodStubEngine';

export const STRIDE_V1_ENGINE_KEY = 'stride.v1';

export const strideV1EngineDescriptor = createKnownMethodStubDescriptor({
  engine_key: STRIDE_V1_ENGINE_KEY,
  engine_id: 'known-method:stride.v1',
  engine_name: 'STRIDE v1 (stub)',
  engine_version: '0.1.0',
  engine_stage: 'experimental',
  algorithm_family: 'known_method.stride',
  reference_label: 'STRIDE v1',
  fidelity_class: 'method_inspired',
  compatibility_claim:
    'STRIDE 系 assignment の比較用 stub。upstream STRIDE との完全互換は主張しない。',
  implementation_origin: 'internal',
  implementation_reference: null,
  upstream_version_label: null,
  default_override_candidate: true,
  capability_descriptor:
    'default override 候補としての provenance/capability 表示動線を検証する known-method stub。',
  degraded_policy:
    'required input が一部欠落しても chain/seq ベースの暫定 assignment を返し、degraded として記録する。',
  unsupported_conditions: ['canonical STRIDE 完全再現', 'STRIDE binary wrapper compatibility'],
  assignment({ residue, residue_index }): SseLabel {
    const phase = Math.abs(residue.labelSeqId + residue_index) % 10;
    if (phase === 0 || phase === 1 || phase === 2 || phase === 3) return 'E';
    if (phase === 6 || phase === 7) return 'H';
    return 'C';
  },
});
