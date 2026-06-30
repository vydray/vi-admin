/**
 * キャスト面談の質問テンプレート。
 * answers(JSONB) のキーはここの key に対応する。将来は店舗ごとに差し替え/追加できるよう
 * 別テーブル化する想定だが、まずはこの既定セットをコードで持つ。
 */
export type InterviewQuestionType = 'text' | 'number'

export interface InterviewQuestion {
  key: string
  label: string
  type: InterviewQuestionType
  unit?: string // 数値項目の単位表示(誤入力防止)
}

export const INTERVIEW_QUESTIONS: InterviewQuestion[] = [
  { key: 'recent', label: '最近どうですか？', type: 'text' },
  { key: 'struggles', label: 'しんどいこと・困っていることは？', type: 'text' },
  { key: 'cast_relations', label: 'キャスト関係で困っていることは？', type: 'text' },
  { key: 'guest_count', label: '今の顧客数', type: 'number', unit: '人' },
  { key: 'target_sales', label: '目標売上', type: 'number', unit: '万円' },
  { key: 'target_groups', label: '組数目標', type: 'number', unit: '組' },
  { key: 'how_to_achieve', label: 'どうしたら目標達成できる？', type: 'text' },
  { key: 'improvement_ideas', label: 'お店・個人でこうしたらいいと思うこと', type: 'text' },
  { key: 'other', label: 'その他', type: 'text' },
]

export type InterviewAnswers = Record<string, string | number | null>
