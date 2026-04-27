-- 報酬明細の完全ロック対応
-- 表示している内訳項目を payslips に保存できるように、不足カラムを追加
--
-- 追加する列:
--   per_attendance_income: 出勤報酬 (1出勤あたりの定額報酬の合計)
--   daily_payment: 日払い合計
--   withholding_tax: 源泉徴収
--   other_deductions: その他控除合計
--
-- 既存の payslips レコードはデフォルト 0 が入る。
-- 値を埋めるには対象月で再計算ボタンを再実行する必要がある。

ALTER TABLE payslips ADD COLUMN IF NOT EXISTS per_attendance_income INT NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS daily_payment INT NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS withholding_tax INT NOT NULL DEFAULT 0;
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS other_deductions INT NOT NULL DEFAULT 0;
