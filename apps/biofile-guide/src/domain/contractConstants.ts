import type {
  DestinationType,
  LegacyPdbReasonCode,
  RecommendedNextStepCode,
  WarningCode,
} from '../types/contracts'

export const WARNING_PRIORITY: WarningCode[] = [
  'legacy_pdb_risk',
  'origin_uncertain',
  'classification_low_confidence',
  'integrative_representation_caution',
  'external_metadata_temporarily_unavailable',
  'multiple_models_present',
  'multiple_chains_present',
  'ligand_present',
  'water_present',
]

export const WARNING_TEXT_MAP: Record<WarningCode, string> = {
  legacy_pdb_risk: 'この構造は旧PDB形式へ落とすと情報が欠ける可能性があります。',
  multiple_models_present: '複数モデルを含むため、最初に見るモデルの選び方に注意してください。',
  multiple_chains_present: '複数鎖を含むため、対象鎖を先に確認してください。',
  ligand_present: 'リガンドを含むため、解釈時にリガンド有無を確認してください。',
  water_present: '水分子を含むため、用途に応じて除外方針を確認してください。',
  origin_uncertain: '出自を断定できないため、原典情報の確認を先に行ってください。',
  classification_low_confidence: '根拠が弱いため、断定せず原典確認を優先してください。',
  integrative_representation_caution: 'integrative表現のため、表現境界の違いに注意してください。',
  external_metadata_temporarily_unavailable:
    '外部情報の一部を今は確認できないため、分かる範囲だけを案内しています。',
}

export const LEGACY_REASON_TEXT_MAP: Record<LegacyPdbReasonCode, string> = {
  extended_id_requires_mmcif:
    '拡張PDB ID前提のため、旧PDB形式では情報欠落の可能性があります。',
  integrative_not_supported_in_pdb:
    'integrative/hybrid表現のため、旧PDB形式との互換性に制約があります。',
  mmcif_only_representation: 'この表現はmmCIF前提であり、旧PDB形式では保持できません。',
  size_or_schema_risk: '旧PDB形式へ変換するとサイズまたはスキーマ上の欠落リスクがあります。',
  unknown_origin: '出自情報が不足しているため、旧PDB互換性を断定できません。',
}

type LinkTemplateDef = {
  destinationType: DestinationType
  template: string
}

export const LINK_TEMPLATES = {
  rcsbEntry: {
    destinationType: 'canonical_entry',
    template: 'https://www.rcsb.org/structure/{id_upper}',
  },
  pdbeEntry: {
    destinationType: 'canonical_entry',
    template: 'https://www.ebi.ac.uk/pdbe/entry/pdb/{id_lower}',
  },
  pdbjEntry: {
    destinationType: 'canonical_entry',
    template: 'https://pdbj.org/mine/summary/{id_upper}',
  },
  molstarRemote: {
    destinationType: 'viewer_remote',
    template: 'https://molstar.org/viewer/?pdb={id_upper}',
  },
  icn3dRemote: {
    destinationType: 'viewer_remote',
    template: 'https://www.ncbi.nlm.nih.gov/Structure/icn3d/full.html?pdbid={id_upper}',
  },
  rcsbSearch: {
    destinationType: 'search_entry',
    template: 'https://www.rcsb.org/search?query={id_upper}',
  },
  molmilLocalGuide: {
    destinationType: 'viewer_local_guide',
    template: 'https://pdbj.org/help/molmil',
  },
  beginnerGuide: {
    destinationType: 'guide_article',
    template: 'https://www.wwpdb.org/documentation/file-format-content/format23/sect1.html',
  },
  internalGuide: {
    destinationType: 'internal_guide',
    template: './',
  },
} satisfies Record<string, LinkTemplateDef>

export const NEXT_STEP_TEXT_MAP: Record<RecommendedNextStepCode, string> = {
  open_rcsb_entry: 'RCSB のエントリページを開いて原典情報を確認してください。',
  open_pdbe_entry: 'PDBe のエントリページを開いて補助情報を確認してください。',
  open_pdbj_entry: 'PDBj のエントリページを開いて補助情報を確認してください。',
  open_molstar_remote: 'Mol* Viewer で構造を開いて全体を確認してください。',
  open_icn3d_remote: 'iCn3D を代替ビューアとして開いて確認してください。',
  open_molstar_local_guide: 'ローカルファイルの閲覧ガイドを確認して次へ進んでください。',
  open_molmil_local_guide: 'PDBj Molmil のローカル閲覧ガイドを確認してください。',
  check_origin_metadata: '出自メタデータを確認して判定根拠を補強してください。',
  check_format_and_retry: '入力形式を確認して再実行してください。',
  read_beginner_guide: 'ガイドを読んで次の確認手順を選んでください。',
}

export const EXTERNAL_DESTINATIONS: DestinationType[] = [
  'canonical_entry',
  'viewer_remote',
  'search_entry',
]
