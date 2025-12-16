-- ================================================================
-- RLS Migration: Role-Based Access Control (ロール別アクセス制御)
-- ================================================================
-- 実行日: 2024-12
-- 目的: 機密テーブルへのアクセスをロール別に制御
--       admin/super_admin/store_admin → フルアクセス
--       staff/manager/cast → アクセス不可 or 自分のデータのみ
-- 前提: add_store_isolation_rls.sql が実行済み
-- ================================================================

-- ================================================================
-- 機密テーブル: admin系ロールのみアクセス可能
-- ================================================================

-- payslips（給与明細）
DROP POLICY IF EXISTS "store_isolation" ON payslips;
CREATE POLICY "role_based_access" ON payslips FOR ALL TO authenticated
USING (
  -- super_admin は全店舗
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  -- store_id=NULL（緊急ログイン全店舗権限）
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  -- admin/store_admin は自店舗全員
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  -- cast/staff/manager は自分のcast_idのみ
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- compensation_settings（報酬設定）
DROP POLICY IF EXISTS "store_isolation" ON compensation_settings;
CREATE POLICY "role_based_access" ON compensation_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_back_rates（バック率）
DROP POLICY IF EXISTS "store_isolation" ON cast_back_rates;
CREATE POLICY "role_based_access" ON cast_back_rates FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  -- バック率は本人にも見せない（adminのみ）
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_deductions（控除実績）
DROP POLICY IF EXISTS "store_isolation" ON cast_deductions;
CREATE POLICY "role_based_access" ON cast_deductions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_daily_items（日別商品詳細）
DROP POLICY IF EXISTS "store_isolation" ON cast_daily_items;
CREATE POLICY "role_based_access" ON cast_daily_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_daily_stats（日別統計）
DROP POLICY IF EXISTS "store_isolation" ON cast_daily_stats;
CREATE POLICY "role_based_access" ON cast_daily_stats FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- ================================================================
-- 設定テーブル: admin系のみアクセス可能
-- ================================================================

-- sales_settings（売上計算設定）
DROP POLICY IF EXISTS "store_isolation" ON sales_settings;
CREATE POLICY "role_based_access" ON sales_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- deduction_types（控除項目マスタ）
DROP POLICY IF EXISTS "store_isolation" ON deduction_types;
CREATE POLICY "role_based_access" ON deduction_types FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- wage_statuses（時給ステータス）
DROP POLICY IF EXISTS "store_isolation" ON wage_statuses;
CREATE POLICY "role_based_access" ON wage_statuses FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- special_wage_days（特別日カレンダー）
DROP POLICY IF EXISTS "store_isolation" ON special_wage_days;
CREATE POLICY "role_based_access" ON special_wage_days FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- store_wage_settings（店舗別時給ルール）
DROP POLICY IF EXISTS "store_isolation" ON store_wage_settings;
CREATE POLICY "role_based_access" ON store_wage_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- late_penalty_rules（遅刻罰金ルール）- FK経由
DROP POLICY IF EXISTS "store_isolation" ON late_penalty_rules;
CREATE POLICY "role_based_access" ON late_penalty_rules FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM deduction_types dt
      WHERE dt.id = late_penalty_rules.deduction_type_id
      AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM deduction_types dt
      WHERE dt.id = late_penalty_rules.deduction_type_id
      AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- late_penalty_tiers（遅刻罰金段階）- FK経由
DROP POLICY IF EXISTS "store_isolation" ON late_penalty_tiers;
CREATE POLICY "role_based_access" ON late_penalty_tiers FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM late_penalty_rules lpr
      JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
      WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
      AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM late_penalty_rules lpr
      JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
      WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
      AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- wage_status_conditions（昇格/降格条件）- FK経由
DROP POLICY IF EXISTS "store_isolation" ON wage_status_conditions;
CREATE POLICY "role_based_access" ON wage_status_conditions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM wage_statuses ws
      WHERE ws.id = wage_status_conditions.status_id
      AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND EXISTS (
      SELECT 1 FROM wage_statuses ws
      WHERE ws.id = wage_status_conditions.status_id
      AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- ================================================================
-- 認証テーブル: admin系のみアクセス可能
-- ================================================================

-- admin_users（管理者ユーザー）
DROP POLICY IF EXISTS "store_isolation" ON admin_users;
CREATE POLICY "role_based_access" ON admin_users FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- admin_emergency_logins（緊急ログイン）
DROP POLICY IF EXISTS "store_isolation" ON admin_emergency_logins;
CREATE POLICY "role_based_access" ON admin_emergency_logins FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND (
      store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
      OR store_id IS NULL
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
);

-- ================================================================
-- 完了
-- ================================================================
