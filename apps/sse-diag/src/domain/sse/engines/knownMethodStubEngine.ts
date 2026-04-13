import { residueKeyToString } from '../compare';
import type { SseEngine, SseEngineDescriptor, SseEngineFactoryParams } from '../engine';
import type {
  EngineCapabilityReport,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineInputRequirements,
  EngineUnavailableReason,
  RawBackboneResidue,
  SseEngineInput,
  SseEngineOutput,
  SseEngineStage,
  SseFidelityClass,
  SseImplementationOrigin,
  SseLabel,
  SseResidueKey,
} from '../types';

type KnownMethodAssignmentInput = {
  residue: SseResidueKey;
  residue_index: number;
  raw_backbone: RawBackboneResidue;
  params: Record<string, string | number | boolean | null>;
};

export type KnownMethodStubConfig = {
  engine_key: string;
  engine_id: string;
  engine_name: string;
  engine_version: string;
  engine_stage: SseEngineStage;
  algorithm_family: string;
  reference_label: string;
  fidelity_class: SseFidelityClass;
  compatibility_claim: string;
  implementation_origin: SseImplementationOrigin;
  implementation_reference?: string | null;
  upstream_version_label?: string | null;
  default_override_candidate?: boolean;
  required_inputs?: string[];
  optional_inputs?: string[];
  unsupported_conditions?: string[];
  capability_descriptor: string;
  degraded_policy: string;
  unavailable_policy?: string;
  assignment: (input: KnownMethodAssignmentInput) => SseLabel;
};

export function createKnownMethodStubDescriptor(
  config: KnownMethodStubConfig
): SseEngineDescriptor {
  return {
    engine_key: config.engine_key,
    engine_id: config.engine_id,
    engine_name: config.engine_name,
    engine_stage: config.engine_stage,
    algorithm_family: config.algorithm_family,
    reference_label: config.reference_label,
    default_override_candidate: config.default_override_candidate ?? false,
    create(params: SseEngineFactoryParams): SseEngine {
      return new KnownMethodStubEngine(config, normalizeFactoryParams(params));
    },
  };
}

class KnownMethodStubEngine implements SseEngine {
  private readonly requiredAtoms = ['N', 'CA', 'C'] as const;
  private readonly config: KnownMethodStubConfig;
  private readonly params: Record<string, string | number | boolean | null>;

  constructor(
    config: KnownMethodStubConfig,
    params: Record<string, string | number | boolean | null>
  ) {
    this.config = config;
    this.params = params;
  }

  async compute(input: SseEngineInput): Promise<SseEngineOutput> {
    const residues = normalizeResidues(input.residues);
    const rawIndex = new Map<string, RawBackboneResidue>();
    for (const entry of input.raw_backbone.residues) {
      rawIndex.set(entry.residue_key, entry);
    }

    const unavailableReasonCounts = new Map<string, number>();
    const degradationReasonCounts = new Map<string, number>();
    const outputResidues: SseEngineOutput['residues'] = [];
    let degradedCount = 0;

    for (let index = 0; index < residues.length; index += 1) {
      const residue = residues[index];
      const residueKey = residueKeyToString(residue);
      const rawBackbone = rawIndex.get(residueKey);
      if (!rawBackbone) {
        incrementCount(unavailableReasonCounts, 'raw_backbone_not_found');
        continue;
      }

      const missingRequired = rawBackbone.missing_required_atoms.filter(
        (atom): atom is (typeof this.requiredAtoms)[number] =>
          atom === 'N' || atom === 'CA' || atom === 'C'
      );
      const missingRequiredCount = missingRequired.length;

      if (missingRequiredCount >= this.requiredAtoms.length) {
        incrementCount(unavailableReasonCounts, 'required_backbone_missing_all');
        continue;
      }

      const degraded = missingRequiredCount > 0 || !rawBackbone.has_required_backbone;
      if (degraded) {
        degradedCount += 1;
        incrementCount(
          degradationReasonCounts,
          `missing_required_backbone_atoms:${missingRequired.join(',') || 'unknown'}`
        );
      }

      const sse = this.config.assignment({
        residue,
        residue_index: index,
        raw_backbone: rawBackbone,
        params: this.params,
      });

      outputResidues.push({
        chainId: residue.chainId,
        labelSeqId: residue.labelSeqId,
        sse,
        energy: 0,
        assignment_quality: degraded ? 'degraded' : 'standard',
        degradation_reason:
          degraded ? `required input 未達: ${missingRequired.join(',') || 'unknown'}` : null,
      });
    }

    const unavailableReasons = toReasonList(unavailableReasonCounts);
    const coverage = buildCoverageReport(
      residues.length,
      outputResidues.length,
      degradedCount,
      unavailableReasons
    );
    const degradation = buildDegradationReport(
      degradedCount,
      this.config.degraded_policy,
      toReasonDetails(degradationReasonCounts)
    );
    const capability = buildCapabilityReport(this.config);
    const inputRequirements = buildInputRequirements(this.config);

    return {
      residues: outputResidues,
      metadata: {
        engine_id: this.config.engine_id,
        engine_name: this.config.engine_name,
        engine_version: this.config.engine_version,
        engine_stage: this.config.engine_stage,
        engine_input_schema_version: input.schema_version,
        algorithm_family: this.config.algorithm_family,
        implementation_origin: this.config.implementation_origin,
        reference_label: this.config.reference_label,
        fidelity_class: this.config.fidelity_class,
        compatibility_claim: this.config.compatibility_claim,
        implementation_reference: this.config.implementation_reference ?? null,
        upstream_version_label: this.config.upstream_version_label ?? null,
        input_requirements: inputRequirements,
        capability_descriptor: this.config.capability_descriptor,
        coverage_report: coverage,
        degradation_report: degradation,
        input_profile: {
          schema_version: input.schema_version,
          residue_count: residues.length,
          raw_backbone_residue_count: input.raw_backbone.residue_count,
          raw_backbone_missing_required_count: input.raw_backbone.missing_required_count,
          raw_backbone_missing_optional_count: input.raw_backbone.missing_optional_count,
          derived_geometry_available: !!input.derived_geometry,
        },
        effective_params: this.params,
        computed_at: new Date().toISOString(),
      },
      capability,
      degradation,
      coverage,
      unavailable_reasons: unavailableReasons,
    };
  }
}

function buildInputRequirements(config: KnownMethodStubConfig): EngineInputRequirements {
  return {
    required_inputs:
      config.required_inputs ??
      ['raw_backbone.N', 'raw_backbone.CA', 'raw_backbone.C'],
    optional_inputs: config.optional_inputs ?? ['raw_backbone.O', 'derived_geometry'],
    unavailable_policy:
      config.unavailable_policy ??
      'required input が全欠落の residue は unavailable として assignment を返さない',
    degraded_policy: config.degraded_policy,
  };
}

function buildCapabilityReport(config: KnownMethodStubConfig): EngineCapabilityReport {
  return {
    required_inputs:
      config.required_inputs ??
      ['raw_backbone.N', 'raw_backbone.CA', 'raw_backbone.C'],
    optional_inputs: config.optional_inputs ?? ['raw_backbone.O', 'derived_geometry'],
    unsupported_conditions: config.unsupported_conditions ?? [],
  };
}

function buildCoverageReport(
  candidateTotal: number,
  assignedTotal: number,
  degradedTotal: number,
  unavailableReasons: EngineUnavailableReason[]
): EngineCoverageReport {
  const unavailableTotal = unavailableReasons.reduce((sum, reason) => sum + reason.count, 0);
  const comparableTotal = Math.max(assignedTotal - degradedTotal, 0);
  return {
    candidate_total: candidateTotal,
    assigned_total: assignedTotal,
    comparable_total: comparableTotal,
    degraded_total: degradedTotal,
    unavailable_total: unavailableTotal,
    coverage_rate: candidateTotal === 0 ? 0 : assignedTotal / candidateTotal,
    comparable_rate: candidateTotal === 0 ? 0 : comparableTotal / candidateTotal,
    unavailable_reasons: unavailableReasons,
  };
}

function buildDegradationReport(
  degradedCount: number,
  policy: string,
  details: string[]
): EngineDegradationReport {
  return {
    degraded: degradedCount > 0,
    degraded_count: degradedCount,
    reason_summary: degradedCount > 0 ? `${degradedCount} residues degraded` : 'none',
    details,
    policy,
  };
}

function normalizeFactoryParams(
  params: SseEngineFactoryParams
): Record<string, string | number | boolean | null> {
  const normalized: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) continue;
    normalized[key] = value;
  }
  return normalized;
}

function normalizeResidues(residues: unknown): SseResidueKey[] {
  if (Array.isArray(residues)) return residues as SseResidueKey[];

  if (residues && typeof (residues as { [Symbol.iterator]?: unknown })[Symbol.iterator] === 'function') {
    return Array.from(residues as Iterable<SseResidueKey>);
  }

  return [];
}

function incrementCount(counter: Map<string, number>, key: string): void {
  counter.set(key, (counter.get(key) ?? 0) + 1);
}

function toReasonList(counter: Map<string, number>): EngineUnavailableReason[] {
  return Array.from(counter.entries()).map(([reason, count]) => ({ reason, count }));
}

function toReasonDetails(counter: Map<string, number>): string[] {
  return Array.from(counter.entries()).map(([reason, count]) => `${reason} x${count}`);
}
