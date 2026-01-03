import type { ResidueKey, SseLabel } from './types';

export type SseDiff = ResidueKey & { molstar: SseLabel; wasm: SseLabel };

export function residueKeyToString(k: ResidueKey): string {
  return `${k.chainId}:${k.labelSeqId}`;
}

export function diffSse(
  molstar: Map<string, SseLabel>,
  wasm: Map<string, SseLabel>
): SseDiff[] {
  const diffs: SseDiff[] = [];
  for (const [key, m] of molstar.entries()) {
    const w = wasm.get(key);
    if (!w) continue;
    if (m !== w) {
      const [chainId, seq] = key.split(':');
      diffs.push({ chainId, labelSeqId: Number(seq), molstar: m, wasm: w });
    }
  }
  return diffs;
}
