import type { SseEngineInput } from '../../domain/sse/types';
import type { RunDiagnosisPipelineInput } from './types';

export function buildEngineInput(
  input: Pick<RunDiagnosisPipelineInput, 'residue_keys' | 'raw_backbone' | 'derived_geometry'>
): SseEngineInput {
  return {
    schema_version: 'engine-input.v2',
    residues: input.residue_keys,
    raw_backbone: input.raw_backbone,
    derived_geometry: input.derived_geometry ?? null,
  };
}
