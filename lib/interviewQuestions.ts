/**
 * キャスト面談の質問テンプレート。
 * answers(JSONB) のキーはここの key に対応する。将来は店舗ごとに差し替え/追加できるよう
 * 別テーブル化する想定だが、まずはこの既定セットをコードで持つ。
 */
export type InterviewQuestionType = 'text' | 'number'

// 面談の流れに沿った4ブロック（現状→目標→達成プラン→次アクション）
export type InterviewBlock = '現状' | '目標' | '達成プラン' | '次アクション'
export const INTERVIEW_BLOCKS: InterviewBlock[] = ['現状', '目標', '達成プラン', '次アクション']

export interface InterviewQuestion {
  key: string
  label: string
  type: InterviewQuestionType
  block: InterviewBlock
  unit?: string // 数値項目の単位表示(誤入力防止)
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { key: 'recent', label: '最近どうですか？', type: 'text', block: '現状' },
  { key: 'struggles', label: 'しんどいこと・困っていることは？', type: 'text', block: '現状' },
  { key: 'cast_relations', label: 'キャスト関係で困っていることは？', type: 'text', block: '現状' },
  { key: 'guest_count', label: '今の顧客数', type: 'number', unit: '人', block: '現状' },
  { key: 'target_sales', label: '目標売上', type: 'number', unit: '万円', block: '目標' },
  { key: 'target_groups', label: '組数目標', type: 'number', unit: '組', block: '目標' },
  { key: 'how_to_achieve', label: 'どうしたら目標達成できる？', type: 'text', block: '達成プラン' },
  { key: 'improvement_ideas', label: 'お店・個人でこうしたらいいと思うこと', type: 'text', block: '次アクション' },
  { key: 'other', label: 'その他', type: 'text', block: '次アクション' },
]

export type InterviewAnswers = Record<string, string | number | null>
