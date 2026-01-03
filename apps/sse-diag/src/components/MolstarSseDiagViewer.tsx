import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

import { createMolstarPlugin, disposeMolstarPlugin } from '../molstar/plugin';
import { loadMmcifText } from '../molstar/load';
import { extractResidueKeys } from '../molstar/extract';
import { attachOverrideSse } from '../molstar/sseOverrideProvider';
import { getMolstarStandardSse } from '../molstar/standardSse';
import { rebuildRepresentations } from '../molstar/state';

import { PrototypeRuleEngine } from '../domain/sse/engines/prototypeRuleEngine';
import { diffSse, residueKeyToString } from '../domain/sse/compare';

export default function MolstarSseDiagViewer() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);

  const [fatal, setFatal] = useState<string | null>(null);
  const [mmcifText, setMmcifText] = useState('');
  const [rangeLo, setRangeLo] = useState(10);
  const [rangeHi, setRangeHi] = useState(20);

  const engine = useMemo(() => new PrototypeRuleEngine([rangeLo, rangeHi]), [rangeLo, rangeHi]);

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        if (!hostRef.current) return;

        const plugin = await createMolstarPlugin(hostRef.current);

        if (disposed) {
          disposeMolstarPlugin(plugin);
          return;
        }
        pluginRef.current = plugin;
      } catch (e) {
        console.error(e);
        setFatal(e instanceof Error ? e.message : String(e));
      }
    })();

    return () => {
      disposed = true;
      if (pluginRef.current) {
        disposeMolstarPlugin(pluginRef.current);
        pluginRef.current = null;
      }
      if (hostRef.current) hostRef.current.innerHTML = "";
    };
  }, []);

  async function runPipeline(text: string) {
    const plugin = pluginRef.current;
    if (!plugin) return;

    await loadMmcifText(plugin, text);

    const molstarMap = await getMolstarStandardSse(plugin);
    const residueKeys = extractResidueKeys(plugin);
    const output = await engine.compute({ residues: residueKeys });

    await attachOverrideSse(plugin, output);
    await rebuildRepresentations(plugin);

    const wasmMap = new Map<string, any>();
    for (const r of output.residues) wasmMap.set(residueKeyToString(r), r.sse);
    const diffs = diffSse(molstarMap, wasmMap);
    console.log('[SSE-Diag] diffs count:', diffs.length);
    console.log('[SSE-Diag] diffs sample:', diffs.slice(0, 50));
  }

  async function onDropFile(file: File) {
    const text = await file.text();
    setMmcifText(text);
    await runPipeline(text);
  }

  if (fatal) {
    return (
      <div style={{ padding: 16, fontFamily: 'monospace', whiteSpace: 'pre-wrap' }}>
        Mol* init failed:
        {'\n'}
        {fatal}
        {'\n\n'}
        Open DevTools Console for details.
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', height: '100vh' }}>
      <div style={{ width: 360, padding: 12, borderRight: '1px solid #ddd' }}>
        <h2 style={{ margin: 0 }}>SSE-Diag</h2>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
          Mol* SSE を “WASM想定の出力” で上書き（MVP: rebuild）
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onDropFile(f);
          }}
          style={{
            height: 80,
            border: '2px dashed #999',
            borderRadius: 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          Drop mmCIF here
        </div>

        <div style={{ fontSize: 12, marginBottom: 6 }}>
          ルール：label_seq_id {rangeLo}–{rangeHi} = Sheet(E), その他 = Helix(H)
        </div>

        <label style={{ fontSize: 12 }}>rangeLo</label>
        <input
          type="number"
          value={rangeLo}
          onChange={(e) => setRangeLo(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 8 }}
        />

        <label style={{ fontSize: 12 }}>rangeHi</label>
        <input
          type="number"
          value={rangeHi}
          onChange={(e) => setRangeHi(Number(e.target.value))}
          style={{ width: '100%', marginBottom: 8 }}
        />

        <button style={{ width: '100%' }} disabled={!mmcifText} onClick={() => void runPipeline(mmcifText)}>
          再解析（rebuild）
        </button>

        <div style={{ fontSize: 12, color: '#555', marginTop: 10 }}>
          差分は console に出します（Phase 1）。
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }} ref={hostRef} />
    </div>
  );
}
