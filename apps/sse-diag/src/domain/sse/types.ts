export type SseLabel = 'H' | 'E' | 'C';

export type ResidueKey = {
  chainId: string;      // label_asym_id
  labelSeqId: number;   // label_seq_id
};

export type ResidueSseRecord = ResidueKey & {
  sse: SseLabel;
  energy: number;       // 将来WASMが返す（MVPは0でOK）
};

export type SseEngineInput = {
  residues: ResidueKey[];
};

export type SseEngineOutput = {
  residues: ResidueSseRecord[];
};

export type SseResidueKey = ResidueKey;
