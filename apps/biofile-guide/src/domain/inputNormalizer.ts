import type { NormalizedInput } from '../application/pipelineTypes'

const PDB_ID_PATTERN = /^[A-Za-z0-9]{4}$/
const EXTENDED_ID_PATTERN = /^pdb_[A-Za-z0-9]{8}$/i

function resolveFileHint(fileName: string): 'local_pdb' | 'local_mmcif' | null {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.pdb') || lower.endsWith('.ent')) {
    return 'local_pdb'
  }
  if (lower.endsWith('.cif') || lower.endsWith('.mmcif')) {
    return 'local_mmcif'
  }
  return null
}

export function normalizeInput(textInput: string, file: File | null): NormalizedInput {
  if (file) {
    return {
      kind: 'file',
      file,
      formatHint: resolveFileHint(file.name),
    }
  }

  const trimmed = textInput.trim()
  if (trimmed.length === 0) {
    return {
      kind: 'error',
      errorCode: 'empty_input',
      message: '入力が空です。',
      reason: 'ID入力またはローカルファイルのどちらかが必要です。',
    }
  }

  if (PDB_ID_PATTERN.test(trimmed)) {
    return {
      kind: 'identifier',
      inputType: 'pdb_id',
      rawText: trimmed,
      canonicalIdentifier: trimmed.toUpperCase(),
    }
  }

  if (EXTENDED_ID_PATTERN.test(trimmed)) {
    return {
      kind: 'identifier',
      inputType: 'extended_pdb_id',
      rawText: trimmed,
      canonicalIdentifier: trimmed.toLowerCase(),
    }
  }

  return {
    kind: 'error',
    errorCode: 'invalid_identifier',
    message: 'ID形式が不正です。',
    reason: '4文字PDB ID または `pdb_` + 8文字英数字の拡張PDB IDを入力してください。',
  }
}
