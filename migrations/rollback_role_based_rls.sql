-- ================================================================
-- RLS Rollback: Role-Based Access Control
-- ================================================================
-- 目的: role_based_accessポリシーを削除し、store_isolationに戻す
-- ================================================================

-- 機密テーブル
DROP POLICY IF EXISTS "role_based_access" ON payslips;
DROP POLICY IF EXISTS "role_based_access" ON compensation_settings;
DROP POLICY IF EXISTS "role_based_access" ON cast_back_rates;
DROP POLICY IF EXISTS "role_based_access" ON cast_deductions;
DROP POLICY IF EXISTS "role_based_access" ON cast_daily_items;
DROP POLICY IF EXISTS "role_based_access" ON cast_daily_stats;
DROP POLICY IF EXISTS "role_based_access" ON sales_settings;
DROP POLICY IF EXISTS "role_based_access" ON deduction_types;
DROP POLICY IF EXISTS "role_based_access" ON wage_statuses;
DROP POLICY IF EXISTS "role_based_access" ON special_wage_days;
DROP POLICY IF EXISTS "role_based_access" ON store_wage_settings;
DROP POLICY IF EXISTS "role_based_access" ON late_penalty_rules;
DROP POLICY IF EXISTS "role_based_access" ON late_penalty_tiers;
DROP POLICY IF EXISTS "role_based_access" ON wage_status_conditions;
DROP POLICY IF EXISTS "role_based_access" ON admin_users;
DROP POLICY IF EXISTS "role_based_access" ON admin_emergency_logins;

-- store_isolationポリシーを復元
CREATE POLICY "store_isolation" ON payslips FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON compensation_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON cast_back_rates FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON cast_deductions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON cast_daily_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON cast_daily_stats FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON sales_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON deduction_types FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON wage_statuses FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON special_wage_days FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON store_wage_settings FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON late_penalty_rules FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM deduction_types dt
    WHERE dt.id = late_penalty_rules.deduction_type_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM deduction_types dt
    WHERE dt.id = late_penalty_rules.deduction_type_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "store_isolation" ON late_penalty_tiers FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM late_penalty_rules lpr
    JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
    WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM late_penalty_rules lpr
    JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
    WHERE lpr.id = late_penalty_tiers.late_penalty_rule_id
    AND dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "store_isolation" ON wage_status_conditions FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM wage_statuses ws
    WHERE ws.id = wage_status_conditions.status_id
    AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR EXISTS (
    SELECT 1 FROM wage_statuses ws
    WHERE ws.id = wage_status_conditions.status_id
    AND ws.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "store_isolation" ON admin_users FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "store_isolation" ON admin_emergency_logins FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  OR store_id IS NULL
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

-- ================================================================
-- 完了
-- ================================================================
