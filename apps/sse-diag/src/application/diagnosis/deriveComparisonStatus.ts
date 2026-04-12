import type { SseMappingResult } from '../../domain/sse/compare';
import type { ComparisonStatus, SseEngineOutput, SseLabel } from '../../domain/sse/types';

type DeriveComparisonStatusInput = {
  baseline_map: Map<string, SseLabel>;
  output: SseEngineOutput | null;
  mapping: SseMappingResult | null;
  failed: boolean;
};

export function deriveComparisonStatus(input: DeriveComparisonStatusInput): ComparisonStatus {
  const { baseline_map: baselineMap, output, mapping, failed } = input;

  if (baselineMap.size === 0) return 'partial';
  if (failed) return 'partial';
  if (!output || output.residues.length === 0) return 'baseline_only';
  if (!mapping) return 'partial';
  if (mapping.stats.mapped_count < mapping.stats.candidate_count) return 'partial';
  if (mapping.stats.unmapped_override_only_count > 0) return 'partial';
  if (mapping.stats.ambiguous_count > 0) return 'partial';

  return 'full';
}
