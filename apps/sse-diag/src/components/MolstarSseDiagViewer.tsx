// apps/sse-diag/src/components/MolstarSseDiagViewer.tsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { PluginUIContext } from 'molstar/lib/mol-plugin-ui/context';

import { createMolstarPlugin, disposeMolstarPlugin } from '../molstar/plugin';
import { loadMmcifText } from '../molstar/load';
import { extractResidueKeys } from '../molstar/extract';
import { getMolstarStandardSse } from '../molstar/standardSse';
import { rebuildCartoonOnly } from '../molstar/state';

import { PrototypeRuleEngine } from '../domain/sse/engines/prototypeRuleEngine';
import { diffSse, residueKeyToString } from '../domain/sse/compare';
import { applyOverrideSseToMolstarModel } from '../molstar/sseOverrideProvider';

type LogFn = (msg: string, data?: unknown) => void;

export default function MolstarSseDiagViewer() {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const pluginRef = useRef<PluginUIContext | null>(null);

  const [fatal, setFatal] = useState<string | null>(null);
  const [mmcifText, setMmcifText] = useState('');
  const [rangeLo, setRangeLo] = useState(10);
  const [rangeHi, setRangeHi] = useState(20);

  // UIログ（consoleに出なくても見える）
  const [logs, setLogs] = useState<string[]>([]);
  const pushLog: LogFn = (msg, data) => {
    const line =
      data === undefined
        ? String(msg)
        : `${msg} ${typeof data === 'string' ? data : safeJson(data)}`;

    // consoleにも出す（Vite側で見たい時用）
    // eslint-disable-next-line no-console
    console.log(line);

    setLogs((prev) => {
      const next = [...prev, line];
      return next.length > 400 ? next.slice(next.length - 400) : next;
    });
  };

  const engine = useMemo(
    () => new PrototypeRuleEngine([rangeLo, rangeHi]),
    [rangeLo, rangeHi]
  );

  useEffect(() => {
    let disposed = false;

    (async () => {
      try {
        if (!hostRef.current) return;

        pushLog('[SSE-Diag] createMolstarPlugin() start');

        const plugin = await createMolstarPlugin(hostRef.current);

        // ✅ Mol* が全画面を覆わないように “右ペイン内” に閉じ込める保険
        try {
          const el = hostRef.current?.querySelector('.msp-plugin') as HTMLElement | null;
          if (el) {
            el.style.position = 'absolute';
            el.style.inset = '0';
          }
        } catch {
          // ignore
        }

        if (disposed) {
          disposeMolstarPlugin(plugin);
          return;
        }

        pluginRef.current = plugin;
        pushLog('[SSE-Diag] createMolstarPlugin() done');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.error(e);
        const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
        setFatal(msg);
        pushLog('[SSE-Diag] Mol* init failed:', msg);
      }
    })();

    return () => {
      disposed = true;
      if (pluginRef.current) {
        disposeMolstarPlugin(pluginRef.current);
        pluginRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function runPipeline(text: string) {
    const plugin = pluginRef.current;
    if (!plugin) {
      pushLog('[SSE-Diag] plugin not ready yet');
      return;
    }

    try {
      pushLog('[SSE-Diag] runPipeline() start');

      // 1) load structure
      pushLog('[SSE-Diag] loadMmcifText()');
      await loadMmcifText(plugin, text);

      // 2) Mol*標準SSE（比較対象）
      pushLog('[SSE-Diag] getMolstarStandardSse()');
      const molstarMap = await getMolstarStandardSse(plugin, pushLog);
      pushLog('[SSE-Diag] molstarMap size:', molstarMap.size);

      // 3) residue keys 抽出 → engine出力
      pushLog('[SSE-Diag] extractResidueKeys()');
      const residueKeys = extractResidueKeys(plugin, pushLog);
      pushLog('[SSE-Diag] residueKeys:', residueKeys.length);

      pushLog('[SSE-Diag] engine.compute()');
      const output = await engine.compute({ residues: residueKeys });
      pushLog('[SSE-Diag] engine output residues:', output.residues.length);

      // 4) ModelのSecondaryStructureProviderを直接上書き（ログ付き）
      pushLog('[SSE-Diag] applyOverrideSseToMolstarModel()');
      await applyOverrideSseToMolstarModel(plugin, output, pushLog);

      // 5) cartoon を作り直し（secondary-structure色で目視確認）
      pushLog('[SSE-Diag] rebuildCartoonOnly()');
      await rebuildCartoonOnly(plugin);

      // diff log
      const wasmMap = new Map<string, any>();
      for (const r of output.residues) wasmMap.set(residueKeyToString(r), r.sse);
      const diffs = diffSse(molstarMap, wasmMap);
      pushLog('[SSE-Diag] diffs count:', diffs.length);
      pushLog('[SSE-Diag] diffs sample:', diffs.slice(0, 30));

      pushLog('[SSE-Diag] runPipeline() done');
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      const msg = e instanceof Error ? (e.stack ?? e.message) : String(e);
      setFatal(msg);
      pushLog('[SSE-Diag] runPipeline FAILED:', msg);
    }
  }

  async function onDropFile(file: File) {
    const text = await file.text();
    setMmcifText(text);
    await runPipeline(text);
  }

  return (
    <div style={{ display: 'flex', height: '100vh', width: '100vw' }}>
      {/* 左ペイン */}
      <div style={{ width: 380, padding: 12, borderRight: '1px solid #ddd', overflow: 'auto' }}>
        <h2 style={{ margin: 0 }}>SSE-Diag</h2>
        <div style={{ fontSize: 12, color: '#555', marginBottom: 12 }}>
          Mol* SSE を “WASM想定の出力” で上書き（MVP: rebuild cartoon）
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

        <button
          style={{ width: '100%' }}
          disabled={!mmcifText}
          onClick={() => void runPipeline(mmcifText)}
        >
          再解析（override → rebuild）
        </button>

        {fatal && (
          <pre style={{ whiteSpace: 'pre-wrap', color: '#b00', background: '#fee', padding: 8, marginTop: 10 }}>
            {fatal}
          </pre>
        )}

        <div style={{ marginTop: 10, display: 'flex', gap: 8 }}>
          <button style={{ flex: 1 }} onClick={() => setLogs([])}>
            ログクリア
          </button>
        </div>

        <div style={{ marginTop: 10 }}>
          <div style={{ fontSize: 12, marginBottom: 6, color: '#555' }}>Debug Log（UI表示）</div>
          <pre
            style={{
              height: 260,
              overflow: 'auto',
              background: '#111',
              color: '#eee',
              padding: 8,
              borderRadius: 6,
              fontSize: 11,
              whiteSpace: 'pre-wrap',
            }}
          >
            {logs.join('\n')}
          </pre>
        </div>
      </div>

      {/* 右ペイン（Mol* ホスト） */}
      <div
        ref={hostRef}
        id="molstar-host"
        style={{
          flex: 1,
          minWidth: 0,
          position: 'relative', // ✅ これが重要
          overflow: 'hidden',   // ✅ はみ出し防止
          background: '#fff',
        }}
      />
    </div>
  );
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}
