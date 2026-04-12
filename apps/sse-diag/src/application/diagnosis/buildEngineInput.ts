import type { SseEngineInput } from '../../domain/sse/types';
import type { RunDiagnosisPipelineInput } from './types';

export function buildEngineInput(
  input: Pick<RunDiagnosisPipelineInput, 'residue_keys'>
): SseEngineInput {
  return {
    residues: input.residue_keys,
  };
}
