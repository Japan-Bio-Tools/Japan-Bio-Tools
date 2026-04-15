import type { SseLabel } from '../types';
import { createKnownMethodStubDescriptor } from './knownMethodStubEngine';

export const PSEA_V1_ENGINE_KEY = 'psea.v1';

export const pseaV1EngineDescriptor = createKnownMethodStubDescriptor({
  engine_key: PSEA_V1_ENGINE_KEY,
  engine_id: 'known-method:psea.v1',
  engine_name: 'P-SEA v1 (stub)',
  engine_version: '0.1.0',
  engine_stage: 'experimental',
  algorithm_family: 'known_method.psea',
  reference_label: 'P-SEA v1',
  fidelity_class: 'method_inspired',
  compatibility_claim:
    'P-SEA 系 assignment の比較用 stub。canonical P-SEA との完全一致は主張しない。',
  implementation_origin: 'internal',
  implementation_reference: null,
  upstream_version_label: null,
  capability_descriptor:
    'known-method catalog 接続確認向けの placeholder 実装。raw backbone 欠落は degraded/unavailable として扱う。',
  degraded_policy:
    'required input が一部欠落した場合でも暫定 assignment を返し、degraded として記録する。',
  unsupported_conditions: ['P-SEA canonical parity', 'external P-SEA wrapper compatibility'],
  assignment({ residue }): SseLabel {
    const mod = Math.abs(residue.labelSeqId) % 8;
    if (mod === 0 || mod === 1) return 'E';
    if (mod === 4 || mod === 5 || mod === 6) return 'H';
    return 'C';
  },
});
