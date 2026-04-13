// apps/sse-diag/src/domain/sse/engines/prototypeRuleEngine.ts
import type {
  EngineCapabilityReport,
  EngineCoverageReport,
  EngineDegradationReport,
  EngineInputRequirements,
  EngineUnavailableReason,
  SseEngineInput,
  SseEngineOutput,
  SseLabel,
  SseResidueKey,
} from '../types';
import type { SseEngine, SseEngineDescriptor, SseEngineFactoryParams } from '../engine';

/**
 * Minimal prototype engine for diagnostics-only comparison framework checks.
 * Assigns Sheet(E) inside range and Helix(H) outside range.
 */
const DEFAULT_RANGE_LO = 10;
const DEFAULT_RANGE_HI = 20;
const ENGINE_ID = 'prototype-rule';
const ENGINE_NAME = 'Prototype rule (diagnostic)';
const ENGINE_VERSION = '0.2.0';

export const PROTOTYPE_RULE_ENGINE_KEY = 'prototype.rule';

export class PrototypeRuleEngine implements SseEngine {
  private rangeLo: number;
  private rangeHi: number;

  constructor(range?: [number, number]) {
    this.rangeLo = range?.[0] ?? DEFAULT_RANGE_LO;
    this.rangeHi = range?.[1] ?? DEFAULT_RANGE_HI;
  }

  async compute(input: SseEngineInput): Promise<SseEngineOutput> {
    const residues = normalizeResidues(input.residues);
    const out = residues.map((r) => ({
      chainId: r.chainId,
      labelSeqId: r.labelSeqId,
      sse: this.assign(r.labelSeqId),
      energy: 0,
      assignment_quality: 'standard' as const,
    }));
    const unavailableReasons: EngineUnavailableReason[] = [];
    const coverage = buildCoverageReport(
      residues.length,
      out.length,
      0,
      unavailableReasons
    );
    const degradation = buildDegradationReport(0, 'この engine は degraded assignment を返さない');
    const capability = buildCapabilityReport();
    const inputRequirements = buildInputRequirements();

    return {
      residues: out,
      metadata: {
        engine_id: ENGINE_ID,
        engine_name: ENGINE_NAME,
        engine_version: ENGINE_VERSION,
        engine_stage: 'prototype',
        engine_input_schema_version: 'engine-input.v2',
        algorithm_family: 'prototype_rule',
        implementation_origin: 'internal',
        reference_label: 'Prototype range rule heuristic',
        fidelity_class: 'prototype',
        compatibility_claim:
          'known method 互換を主張しない。範囲ベースの内部試験ルールとしてのみ提供する。',
        implementation_reference: null,
        upstream_version_label: null,
        input_requirements: inputRequirements,
        capability_descriptor:
          'residue key のみで assignment を返す。raw backbone は比較ワークベンチ接続確認にのみ参照する。',
        coverage_report: coverage,
        degradation_report: degradation,
        input_profile: {
          source: 'molstar_residue_keys',
          schema_version: input.schema_version,
          residue_count: residues.length,
          raw_backbone_residue_count: input.raw_backbone.residue_count,
          derived_geometry_available: !!input.derived_geometry,
          residue_key_policy: 'label_asym_id + label_seq_id',
        },
        effective_params: {
          rangeLo: this.rangeLo,
          rangeHi: this.rangeHi,
        },
        computed_at: new Date().toISOString(),
      },
      capability,
      degradation,
      coverage,
      unavailable_reasons: unavailableReasons,
    };
  }

  private assign(labelSeqId: number): SseLabel {
    return labelSeqId >= this.rangeLo && labelSeqId <= this.rangeHi ? 'E' : 'H';
  }
}

function readRangeParam(
  params: SseEngineFactoryParams,
  key: 'rangeLo' | 'rangeHi',
  fallback: number
): number {
  const raw = params[key];
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw;
  if (typeof raw === 'string') {
    const n = Number(raw);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

/**
 * Descriptor registered in the internal engine registry.
 * Keeps engine-specific construction details outside the Viewer orchestration.
 */
export const prototypeRuleEngineDescriptor: SseEngineDescriptor = {
  engine_key: PROTOTYPE_RULE_ENGINE_KEY,
  engine_id: ENGINE_ID,
  engine_name: ENGINE_NAME,
  engine_stage: 'prototype',
  algorithm_family: 'prototype_rule',
  reference_label: 'Prototype range rule heuristic',
  default_override_candidate: false,
  create(params: SseEngineFactoryParams): SseEngine {
    const rangeLo = readRangeParam(params, 'rangeLo', DEFAULT_RANGE_LO);
    const rangeHi = readRangeParam(params, 'rangeHi', DEFAULT_RANGE_HI);
    return new PrototypeRuleEngine([rangeLo, rangeHi]);
  },
};

function buildInputRequirements(): EngineInputRequirements {
  return {
    required_inputs: ['residues.label_asym_id', 'residues.label_seq_id'],
    optional_inputs: ['raw_backbone', 'derived_geometry'],
    unavailable_policy: 'residue key が無い residue は assignment を返さない',
    degraded_policy: 'この engine は degraded assignment を返さない',
  };
}

function buildCapabilityReport(): EngineCapabilityReport {
  return {
    required_inputs: ['residues.label_asym_id', 'residues.label_seq_id'],
    optional_inputs: ['raw_backbone', 'derived_geometry'],
    unsupported_conditions: ['known method 互換比較', '原子座標依存判定'],
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
  const coverageRate = candidateTotal === 0 ? 0 : assignedTotal / candidateTotal;
  const comparableRate = candidateTotal === 0 ? 0 : comparableTotal / candidateTotal;
  return {
    candidate_total: candidateTotal,
    assigned_total: assignedTotal,
    comparable_total: comparableTotal,
    degraded_total: degradedTotal,
    unavailable_total: unavailableTotal,
    coverage_rate: coverageRate,
    comparable_rate: comparableRate,
    unavailable_reasons: unavailableReasons,
  };
}

function buildDegradationReport(
  degradedCount: number,
  policy: string
): EngineDegradationReport {
  return {
    degraded: degradedCount > 0,
    degraded_count: degradedCount,
    reason_summary: degradedCount > 0 ? `${degradedCount} residues degraded` : 'none',
    details: degradedCount > 0 ? ['range heuristic fallback'] : [],
    policy,
  };
}

/** Tolerates array-like/iterable inputs to keep prototype calls resilient. */
function normalizeResidues(residues: unknown): SseResidueKey[] {
  if (Array.isArray(residues)) return residues as SseResidueKey[];

  // Set / iterable
  if (residues && typeof (residues as any)[Symbol.iterator] === 'function') {
    return Array.from(residues as any) as SseResidueKey[];
  }

  // Map values()
  if (residues && typeof (residues as any).values === 'function') {
    try {
      return Array.from((residues as any).values()) as SseResidueKey[];
    } catch {
      // ignore
    }
  }

  return [];
}
