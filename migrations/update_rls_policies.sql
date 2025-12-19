-- ================================================================
-- RLSポリシー更新（2024-12-19）
-- ================================================================
-- 目的: キャストのアクセス制限を強化
-- 実行前に必ずバックアップを取ること
-- ================================================================

-- ================================================================
-- 既存ポリシーの削除
-- ================================================================

-- 管理系
DROP POLICY IF EXISTS "store_isolation" ON admin_users;
DROP POLICY IF EXISTS "role_based_access" ON admin_users;
DROP POLICY IF EXISTS "allow_all_access" ON admin_users;

DROP POLICY IF EXISTS "store_isolation" ON admin_emergency_logins;
DROP POLICY IF EXISTS "role_based_access" ON admin_emergency_logins;
DROP POLICY IF EXISTS "allow_all_access" ON admin_emergency_logins;

DROP POLICY IF EXISTS "store_isolation" ON stores;
DROP POLICY IF EXISTS "role_based_access" ON stores;
DROP POLICY IF EXISTS "allow_all_access" ON stores;

DROP POLICY IF EXISTS "store_isolation" ON users;
DROP POLICY IF EXISTS "role_based_access" ON users;
DROP POLICY IF EXISTS "allow_all_access" ON users;

DROP POLICY IF EXISTS "store_isolation" ON system_settings;
DROP POLICY IF EXISTS "role_based_access" ON system_settings;
DROP POLICY IF EXISTS "allow_all_access" ON system_settings;

DROP POLICY IF EXISTS "store_isolation" ON store_line_configs;
DROP POLICY IF EXISTS "role_based_access" ON store_line_configs;
DROP POLICY IF EXISTS "allow_all_access" ON store_line_configs;

DROP POLICY IF EXISTS "store_isolation" ON line_register_requests;
DROP POLICY IF EXISTS "role_based_access" ON line_register_requests;
DROP POLICY IF EXISTS "allow_all_access" ON line_register_requests;

-- キャスト管理
DROP POLICY IF EXISTS "store_isolation" ON casts;
DROP POLICY IF EXISTS "role_based_access" ON casts;
DROP POLICY IF EXISTS "allow_all_access" ON casts;

DROP POLICY IF EXISTS "store_isolation" ON casts_backup;
DROP POLICY IF EXISTS "role_based_access" ON casts_backup;
DROP POLICY IF EXISTS "allow_all_access" ON casts_backup;

DROP POLICY IF EXISTS "store_isolation" ON cast_positions;
DROP POLICY IF EXISTS "role_based_access" ON cast_positions;
DROP POLICY IF EXISTS "allow_all_access" ON cast_positions;

DROP POLICY IF EXISTS "store_isolation" ON costumes;
DROP POLICY IF EXISTS "role_based_access" ON costumes;
DROP POLICY IF EXISTS "allow_all_access" ON costumes;

DROP POLICY IF EXISTS "store_isolation" ON visitor_reservations;
DROP POLICY IF EXISTS "role_based_access" ON visitor_reservations;
DROP POLICY IF EXISTS "allow_all_access" ON visitor_reservations;

-- シフト・勤怠
DROP POLICY IF EXISTS "store_isolation" ON shifts;
DROP POLICY IF EXISTS "role_based_access" ON shifts;
DROP POLICY IF EXISTS "allow_all_access" ON shifts;

DROP POLICY IF EXISTS "store_isolation" ON shift_requests;
DROP POLICY IF EXISTS "role_based_access" ON shift_requests;
DROP POLICY IF EXISTS "allow_all_access" ON shift_requests;

DROP POLICY IF EXISTS "store_isolation" ON shift_locks;
DROP POLICY IF EXISTS "role_based_access" ON shift_locks;
DROP POLICY IF EXISTS "allow_all_access" ON shift_locks;

DROP POLICY IF EXISTS "store_isolation" ON attendance;
DROP POLICY IF EXISTS "role_based_access" ON attendance;
DROP POLICY IF EXISTS "allow_all_access" ON attendance;

DROP POLICY IF EXISTS "store_isolation" ON attendance_history;
DROP POLICY IF EXISTS "role_based_access" ON attendance_history;
DROP POLICY IF EXISTS "allow_all_access" ON attendance_history;

DROP POLICY IF EXISTS "store_isolation" ON attendance_statuses;
DROP POLICY IF EXISTS "role_based_access" ON attendance_statuses;
DROP POLICY IF EXISTS "allow_all_access" ON attendance_statuses;

-- 売上・バック・目標
DROP POLICY IF EXISTS "store_isolation" ON cast_daily_stats;
DROP POLICY IF EXISTS "role_based_access" ON cast_daily_stats;
DROP POLICY IF EXISTS "allow_all_access" ON cast_daily_stats;

DROP POLICY IF EXISTS "store_isolation" ON cast_daily_items;
DROP POLICY IF EXISTS "role_based_access" ON cast_daily_items;
DROP POLICY IF EXISTS "allow_all_access" ON cast_daily_items;

DROP POLICY IF EXISTS "store_isolation" ON sales_settings;
DROP POLICY IF EXISTS "role_based_access" ON sales_settings;
DROP POLICY IF EXISTS "allow_all_access" ON sales_settings;

DROP POLICY IF EXISTS "store_isolation" ON cast_back_rates;
DROP POLICY IF EXISTS "role_based_access" ON cast_back_rates;
DROP POLICY IF EXISTS "allow_all_access" ON cast_back_rates;

DROP POLICY IF EXISTS "store_isolation" ON monthly_targets;
DROP POLICY IF EXISTS "role_based_access" ON monthly_targets;
DROP POLICY IF EXISTS "allow_all_access" ON monthly_targets;

DROP POLICY IF EXISTS "store_isolation" ON cast_sales_targets;
DROP POLICY IF EXISTS "role_based_access" ON cast_sales_targets;
DROP POLICY IF EXISTS "allow_all_access" ON cast_sales_targets;

-- 給与・報酬
DROP POLICY IF EXISTS "store_isolation" ON compensation_settings;
DROP POLICY IF EXISTS "role_based_access" ON compensation_settings;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_settings;

DROP POLICY IF EXISTS "store_isolation" ON wage_statuses;
DROP POLICY IF EXISTS "role_based_access" ON wage_statuses;
DROP POLICY IF EXISTS "allow_all_access" ON wage_statuses;

DROP POLICY IF EXISTS "store_isolation" ON wage_status_conditions;
DROP POLICY IF EXISTS "role_based_access" ON wage_status_conditions;
DROP POLICY IF EXISTS "allow_all_access" ON wage_status_conditions;

DROP POLICY IF EXISTS "store_isolation" ON store_wage_settings;
DROP POLICY IF EXISTS "role_based_access" ON store_wage_settings;
DROP POLICY IF EXISTS "allow_all_access" ON store_wage_settings;

DROP POLICY IF EXISTS "store_isolation" ON special_wage_days;
DROP POLICY IF EXISTS "role_based_access" ON special_wage_days;
DROP POLICY IF EXISTS "allow_all_access" ON special_wage_days;

DROP POLICY IF EXISTS "store_isolation" ON deduction_types;
DROP POLICY IF EXISTS "role_based_access" ON deduction_types;
DROP POLICY IF EXISTS "allow_all_access" ON deduction_types;

DROP POLICY IF EXISTS "store_isolation" ON late_penalty_rules;
DROP POLICY IF EXISTS "role_based_access" ON late_penalty_rules;
DROP POLICY IF EXISTS "allow_all_access" ON late_penalty_rules;

DROP POLICY IF EXISTS "store_isolation" ON late_penalty_tiers;
DROP POLICY IF EXISTS "role_based_access" ON late_penalty_tiers;
DROP POLICY IF EXISTS "allow_all_access" ON late_penalty_tiers;

DROP POLICY IF EXISTS "store_isolation" ON cast_deductions;
DROP POLICY IF EXISTS "role_based_access" ON cast_deductions;
DROP POLICY IF EXISTS "allow_all_access" ON cast_deductions;

DROP POLICY IF EXISTS "store_isolation" ON payslips;
DROP POLICY IF EXISTS "role_based_access" ON payslips;
DROP POLICY IF EXISTS "allow_all_access" ON payslips;

DROP POLICY IF EXISTS "store_isolation" ON compensation_sample_receipts;
DROP POLICY IF EXISTS "role_based_access" ON compensation_sample_receipts;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_sample_receipts;

DROP POLICY IF EXISTS "store_isolation" ON compensation_sample_items;
DROP POLICY IF EXISTS "role_based_access" ON compensation_sample_items;
DROP POLICY IF EXISTS "allow_all_access" ON compensation_sample_items;

-- POS・会計
DROP POLICY IF EXISTS "store_isolation" ON orders;
DROP POLICY IF EXISTS "role_based_access" ON orders;
DROP POLICY IF EXISTS "allow_all_access" ON orders;

DROP POLICY IF EXISTS "store_isolation" ON order_items;
DROP POLICY IF EXISTS "role_based_access" ON order_items;
DROP POLICY IF EXISTS "allow_all_access" ON order_items;

DROP POLICY IF EXISTS "store_isolation" ON current_order_items;
DROP POLICY IF EXISTS "role_based_access" ON current_order_items;
DROP POLICY IF EXISTS "allow_all_access" ON current_order_items;

DROP POLICY IF EXISTS "store_isolation" ON payments;
DROP POLICY IF EXISTS "role_based_access" ON payments;
DROP POLICY IF EXISTS "allow_all_access" ON payments;

DROP POLICY IF EXISTS "store_isolation" ON products;
DROP POLICY IF EXISTS "role_based_access" ON products;
DROP POLICY IF EXISTS "allow_all_access" ON products;

DROP POLICY IF EXISTS "store_isolation" ON product_categories;
DROP POLICY IF EXISTS "role_based_access" ON product_categories;
DROP POLICY IF EXISTS "allow_all_access" ON product_categories;

DROP POLICY IF EXISTS "store_isolation" ON receipt_sequences;
DROP POLICY IF EXISTS "role_based_access" ON receipt_sequences;
DROP POLICY IF EXISTS "allow_all_access" ON receipt_sequences;

DROP POLICY IF EXISTS "store_isolation" ON receipt_settings;
DROP POLICY IF EXISTS "role_based_access" ON receipt_settings;
DROP POLICY IF EXISTS "allow_all_access" ON receipt_settings;

DROP POLICY IF EXISTS "store_isolation" ON table_status;
DROP POLICY IF EXISTS "role_based_access" ON table_status;
DROP POLICY IF EXISTS "allow_all_access" ON table_status;

DROP POLICY IF EXISTS "store_isolation" ON cash_counts;
DROP POLICY IF EXISTS "role_based_access" ON cash_counts;
DROP POLICY IF EXISTS "allow_all_access" ON cash_counts;

DROP POLICY IF EXISTS "store_isolation" ON daily_reports;
DROP POLICY IF EXISTS "role_based_access" ON daily_reports;
DROP POLICY IF EXISTS "allow_all_access" ON daily_reports;

-- BASE連携
DROP POLICY IF EXISTS "store_isolation" ON base_settings;
DROP POLICY IF EXISTS "role_based_access" ON base_settings;
DROP POLICY IF EXISTS "allow_all_access" ON base_settings;

DROP POLICY IF EXISTS "store_isolation" ON base_orders;
DROP POLICY IF EXISTS "role_based_access" ON base_orders;
DROP POLICY IF EXISTS "allow_all_access" ON base_orders;

DROP POLICY IF EXISTS "store_isolation" ON base_products;
DROP POLICY IF EXISTS "role_based_access" ON base_products;
DROP POLICY IF EXISTS "allow_all_access" ON base_products;

DROP POLICY IF EXISTS "store_isolation" ON base_variations;
DROP POLICY IF EXISTS "role_based_access" ON base_variations;
DROP POLICY IF EXISTS "allow_all_access" ON base_variations;


-- ================================================================
-- 新規ポリシー作成
-- ================================================================

-- ================================================================
-- パターン1: adminのみ（super_admin + admin/store_admin の自店舗）
-- ================================================================

-- admin_users
CREATE POLICY "admin_only" ON admin_users FOR ALL TO authenticated
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

-- admin_emergency_logins
CREATE POLICY "admin_only" ON admin_emergency_logins FOR ALL TO authenticated
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

-- users
CREATE POLICY "admin_only" ON users FOR ALL TO authenticated
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

-- system_settings
CREATE POLICY "admin_only" ON system_settings FOR ALL TO authenticated
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

-- line_register_requests
CREATE POLICY "admin_only" ON line_register_requests FOR ALL TO authenticated
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

-- casts_backup
CREATE POLICY "admin_only" ON casts_backup FOR ALL TO authenticated
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

-- cast_positions
CREATE POLICY "admin_only" ON cast_positions FOR ALL TO authenticated
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

-- costumes
CREATE POLICY "admin_only" ON costumes FOR ALL TO authenticated
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

-- attendance_history
CREATE POLICY "admin_only" ON attendance_history FOR ALL TO authenticated
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

-- attendance_statuses
CREATE POLICY "admin_only" ON attendance_statuses FOR ALL TO authenticated
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

-- sales_settings
CREATE POLICY "admin_only" ON sales_settings FOR ALL TO authenticated
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

-- monthly_targets
CREATE POLICY "admin_only" ON monthly_targets FOR ALL TO authenticated
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

-- compensation_settings
CREATE POLICY "admin_only" ON compensation_settings FOR ALL TO authenticated
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

-- wage_statuses
CREATE POLICY "admin_only" ON wage_statuses FOR ALL TO authenticated
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

-- special_wage_days
CREATE POLICY "admin_only" ON special_wage_days FOR ALL TO authenticated
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

-- deduction_types
CREATE POLICY "admin_only" ON deduction_types FOR ALL TO authenticated
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

-- late_penalty_rules
CREATE POLICY "admin_only" ON late_penalty_rules FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND deduction_type_id IN (
      SELECT id FROM deduction_types
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND deduction_type_id IN (
      SELECT id FROM deduction_types
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- late_penalty_tiers
CREATE POLICY "admin_only" ON late_penalty_tiers FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND late_penalty_rule_id IN (
      SELECT lpr.id FROM late_penalty_rules lpr
      JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
      WHERE dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND late_penalty_rule_id IN (
      SELECT lpr.id FROM late_penalty_rules lpr
      JOIN deduction_types dt ON dt.id = lpr.deduction_type_id
      WHERE dt.store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- compensation_sample_receipts
CREATE POLICY "admin_only" ON compensation_sample_receipts FOR ALL TO authenticated
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

-- compensation_sample_items (receipt_id経由で制限)
CREATE POLICY "admin_only" ON compensation_sample_items FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND receipt_id IN (
      SELECT id FROM compensation_sample_receipts
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND receipt_id IN (
      SELECT id FROM compensation_sample_receipts
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- POS・会計系（全てadminのみ）
CREATE POLICY "admin_only" ON orders FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON order_items FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON current_order_items FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON payments FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON products FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON product_categories FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON receipt_sequences FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON receipt_settings FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON table_status FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON cash_counts FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON daily_reports FOR ALL TO authenticated
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

-- BASE連携（adminのみ - base_orders以外）
CREATE POLICY "admin_only" ON base_settings FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON base_products FOR ALL TO authenticated
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

CREATE POLICY "admin_only" ON base_variations FOR ALL TO authenticated
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


-- ================================================================
-- パターン2: super_adminのみ
-- ================================================================

-- store_line_configs
CREATE POLICY "super_admin_only" ON store_line_configs FOR ALL TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
);


-- ================================================================
-- パターン3: 読み取りのみ（SELECT: 店舗全員, INSERT/UPDATE/DELETE: adminのみ）
-- ================================================================

-- stores
CREATE POLICY "select_store" ON stores FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "write_admin_only" ON stores FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON stores FOR UPDATE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "delete_admin_only" ON stores FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- wage_status_conditions
CREATE POLICY "select_store" ON wage_status_conditions FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR status_id IN (
    SELECT id FROM wage_statuses
    WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "write_admin_only" ON wage_status_conditions FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND status_id IN (
      SELECT id FROM wage_statuses
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

CREATE POLICY "update_admin_only" ON wage_status_conditions FOR UPDATE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND status_id IN (
      SELECT id FROM wage_statuses
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
)
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND status_id IN (
      SELECT id FROM wage_statuses
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

CREATE POLICY "delete_admin_only" ON wage_status_conditions FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND status_id IN (
      SELECT id FROM wage_statuses
      WHERE store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    )
  )
);

-- store_wage_settings
CREATE POLICY "select_store" ON store_wage_settings FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
);

CREATE POLICY "write_admin_only" ON store_wage_settings FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON store_wage_settings FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON store_wage_settings FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);


-- ================================================================
-- パターン4: 自分のみ（全操作可）
-- ================================================================

-- shifts
CREATE POLICY "self_or_admin" ON shifts FOR ALL TO authenticated
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
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
);

-- shift_requests
CREATE POLICY "self_or_admin" ON shift_requests FOR ALL TO authenticated
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
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
);

-- cast_sales_targets
CREATE POLICY "self_or_admin" ON cast_sales_targets FOR ALL TO authenticated
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
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
);


-- ================================================================
-- パターン5: 自分のみ・読み取りのみ（SELECT: 自分+admin, 書込: adminのみ）
-- ================================================================

-- casts
CREATE POLICY "select_self_or_admin" ON casts FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
  )
);

CREATE POLICY "write_admin_only" ON casts FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON casts FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON casts FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- visitor_reservations
CREATE POLICY "select_self_or_admin" ON visitor_reservations FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON visitor_reservations FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON visitor_reservations FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON visitor_reservations FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- shift_locks
CREATE POLICY "select_self_or_admin" ON shift_locks FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON shift_locks FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON shift_locks FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON shift_locks FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- attendance (cast_name で絞る必要があるため特殊)
CREATE POLICY "select_self_or_admin" ON attendance FOR SELECT TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
  OR (
    store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
    AND cast_name = (
      SELECT name FROM casts
      WHERE id = (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
    )
  )
);

CREATE POLICY "write_admin_only" ON attendance FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON attendance FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON attendance FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_daily_stats
CREATE POLICY "select_self_or_admin" ON cast_daily_stats FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON cast_daily_stats FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON cast_daily_stats FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON cast_daily_stats FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_daily_items
CREATE POLICY "select_self_or_admin" ON cast_daily_items FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON cast_daily_items FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON cast_daily_items FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON cast_daily_items FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_back_rates
CREATE POLICY "select_self_or_admin" ON cast_back_rates FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON cast_back_rates FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON cast_back_rates FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON cast_back_rates FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- cast_deductions
CREATE POLICY "select_self_or_admin" ON cast_deductions FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON cast_deductions FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON cast_deductions FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON cast_deductions FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- payslips
CREATE POLICY "select_self_or_admin" ON payslips FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON payslips FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON payslips FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON payslips FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

-- base_orders
CREATE POLICY "select_self_or_admin" ON base_orders FOR SELECT TO authenticated
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
);

CREATE POLICY "write_admin_only" ON base_orders FOR INSERT TO authenticated
WITH CHECK (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);

CREATE POLICY "update_admin_only" ON base_orders FOR UPDATE TO authenticated
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

CREATE POLICY "delete_admin_only" ON base_orders FOR DELETE TO authenticated
USING (
  (auth.jwt() -> 'app_metadata' ->> 'role') = 'super_admin'
  OR (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NULL
  OR (
    (auth.jwt() -> 'app_metadata' ->> 'role') IN ('admin', 'store_admin')
    AND store_id = (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
  )
);


-- ================================================================
-- RPC関数のセキュリティチェック追加
-- ================================================================

-- get_product_cast_ranking にセキュリティチェック追加
CREATE OR REPLACE FUNCTION get_product_cast_ranking(
  p_store_id integer,
  p_product_name text,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  cast_id integer,
  cast_name text,
  total_quantity bigint,
  total_sales bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- セキュリティチェック
  IF p_store_id != (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
     AND (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('super_admin', 'admin', 'store_admin')
     AND (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Access denied: cannot view other store rankings';
  END IF;

  RETURN QUERY
  SELECT
    cdi.cast_id,
    c.name::text as cast_name,
    COALESCE(SUM(cdi.quantity), 0)::bigint as total_quantity,
    COALESCE(SUM(cdi.subtotal), 0)::bigint as total_sales
  FROM cast_daily_items cdi
  INNER JOIN casts c ON c.id = cdi.cast_id
  WHERE cdi.store_id = p_store_id
    AND cdi.product_name = p_product_name
    AND cdi.date >= p_start_date
    AND cdi.date <= p_end_date
    AND c.is_active = true
  GROUP BY cdi.cast_id, c.name
  ORDER BY total_quantity DESC;
END;
$$;

-- get_store_products にセキュリティチェック追加
CREATE OR REPLACE FUNCTION get_store_products(
  p_store_id integer,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  product_name text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- セキュリティチェック
  IF p_store_id != (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
     AND (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('super_admin', 'admin', 'store_admin')
     AND (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Access denied: cannot view other store data';
  END IF;

  RETURN QUERY
  SELECT DISTINCT cdi.product_name::text
  FROM cast_daily_items cdi
  WHERE cdi.store_id = p_store_id
    AND cdi.date >= p_start_date
    AND cdi.date <= p_end_date
  ORDER BY cdi.product_name;
END;
$$;

-- get_cast_daily_sales にセキュリティチェック追加
CREATE OR REPLACE FUNCTION get_cast_daily_sales(
  p_cast_id integer,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  id integer,
  date date,
  self_sales_receipt_based bigint,
  total_sales_receipt_based bigint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cast_store_id integer;
BEGIN
  -- キャストの店舗IDを取得
  SELECT store_id INTO v_cast_store_id FROM casts WHERE casts.id = p_cast_id;

  -- セキュリティチェック: 自分のデータまたはadmin
  IF p_cast_id != (auth.jwt() -> 'app_metadata' ->> 'user_id')::integer
     AND (auth.jwt() -> 'app_metadata' ->> 'role') NOT IN ('super_admin', 'admin', 'store_admin')
     AND (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Access denied: cannot view other cast data';
  END IF;

  -- 店舗チェック（adminも自店舗のみ）
  IF v_cast_store_id != (auth.jwt() -> 'app_metadata' ->> 'store_id')::integer
     AND (auth.jwt() -> 'app_metadata' ->> 'role') != 'super_admin'
     AND (auth.jwt() -> 'app_metadata' ->> 'store_id') IS NOT NULL
  THEN
    RAISE EXCEPTION 'Access denied: cannot view other store data';
  END IF;

  RETURN QUERY
  SELECT
    cds.id,
    cds.date,
    COALESCE(cds.self_sales_receipt_based, 0)::bigint,
    COALESCE(cds.total_sales_receipt_based, 0)::bigint
  FROM cast_daily_stats cds
  WHERE cds.cast_id = p_cast_id
    AND cds.date >= p_start_date
    AND cds.date <= p_end_date
  ORDER BY cds.date DESC;
END;
$$;


-- ================================================================
-- 完了
-- ================================================================
