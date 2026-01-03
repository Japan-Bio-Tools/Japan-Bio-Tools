import type { SseEngine } from '../engine';
import type { SseEngineInput, SseEngineOutput, SseLabel } from '../types';

export class PrototypeRuleEngine implements SseEngine {
  constructor(private readonly sheetRange: [number, number] = [10, 20]) {}

  async compute(input: SseEngineInput): Promise<SseEngineOutput> {
    const [a, b] = this.sheetRange;
    const lo = Math.min(a, b);
    const hi = Math.max(a, b);

    const residues = input.residues.map(r => {
      const sse: SseLabel = (r.labelSeqId >= lo && r.labelSeqId <= hi) ? 'E' : 'H';
      return { ...r, sse, energy: 0.0 };
    });

    return { residues };
  }
}
