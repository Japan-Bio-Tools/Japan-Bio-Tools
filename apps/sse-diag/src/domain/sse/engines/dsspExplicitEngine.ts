import type { SseLabel } from '../types';
import { createKnownMethodStubDescriptor } from './knownMethodStubEngine';

export const DSSP_EXPLICIT_ENGINE_KEY = 'dssp.explicit.v1';

export const dsspExplicitEngineDescriptor = createKnownMethodStubDescriptor({
  engine_key: DSSP_EXPLICIT_ENGINE_KEY,
  engine_id: 'known-method:dssp.explicit.v1',
  engine_name: 'DSSP explicit v1 (stub)',
  engine_version: '0.1.0',
  engine_stage: 'experimental',
  algorithm_family: 'known_method.dssp',
  reference_label: 'DSSP explicit v1',
  fidelity_class: 'method_inspired',
  compatibility_claim:
    'DSSP 系 assignment の比較用 stub。canonical DSSP との完全一致は主張しない。',
  implementation_origin: 'internal',
  implementation_reference: null,
  upstream_version_label: null,
  capability_descriptor:
    'raw backbone を一次入力として利用し、required input 欠落時は degraded/unavailable を明示する。',
  degraded_policy:
    'required input が一部欠落しても residue 局所情報で暫定 assignment を返し、degraded として記録する。',
  unsupported_conditions: ['canonical DSSP 完全再現', 'DSSP external binary compatibility'],
  assignment({ residue }): SseLabel {
    const mod = Math.abs(residue.labelSeqId) % 9;
    if (mod === 0 || mod === 1 || mod === 2) return 'H';
    if (mod === 4 || mod === 5 || mod === 6) return 'E';
    return 'C';
  },
});
