-- 報酬形態の比較を保存値からも復元できるようにするため
-- payslips.compensation_breakdown に全報酬形態の計算結果(採用されなかったものも含む)を保存する
ALTER TABLE payslips ADD COLUMN IF NOT EXISTS compensation_breakdown JSONB;
COMMENT ON COLUMN payslips.compensation_breakdown IS '全報酬形態の計算結果(採用されなかったものも含む)。配列で各報酬形態の収入内訳と合計、is_selectedフラグを含む';
