// apps/sse-diag/src/domain/sse/engines/prototypeRuleEngine.ts
import type { SseEngineInput, SseEngineOutput, SseResidueKey, SseLabel } from '../types';

/**
 * MVP用：範囲内だけ Sheet(E)、それ以外 Helix(H)
 * - input.residues が Array でなくても落ちないように強制的に配列化する
 */
export class PrototypeRuleEngine {
  private rangeLo: number;
  private rangeHi: number;

  constructor(range?: [number, number]) {
    this.rangeLo = range?.[0] ?? 10;
    this.rangeHi = range?.[1] ?? 20;
  }

  async compute(input: SseEngineInput): Promise<SseEngineOutput> {
    const residues = normalizeResidues(input.residues);

    const out = residues.map((r) => ({
      chainId: r.chainId,
      labelSeqId: r.labelSeqId,
      sse: this.assign(r.labelSeqId),
      energy: 0,
    }));

    return { residues: out };
  }

  private assign(labelSeqId: number): SseLabel {
    return labelSeqId >= this.rangeLo && labelSeqId <= this.rangeHi ? 'E' : 'H';
  }
}

/** Set/Map/オブジェクトでも落ちないようにする */
function normalizeResidues(residues: unknown): SseResidueKey[] {
  if (Array.isArray(residues)) return residues as SseResidueKey[];

  // Set / iterable
  if (residues && typeof (residues as any)[Symbol.iterator] === 'function') {
    return Array.from(residues as any) as SseResidueKey[];
  }

  // Map の values()
  if (residues && typeof (residues as any).values === 'function') {
    try {
      return Array.from((residues as any).values()) as SseResidueKey[];
    } catch {
      // ignore
    }
  }

  return [];
}
