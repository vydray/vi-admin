-- Insert default system_settings for store_id=2 (MistressMirage)
INSERT INTO system_settings (store_id, setting_key, setting_value) VALUES
(2, 'consumption_tax_rate', 0.10),
(2, 'service_charge_rate', 0.15),
(2, 'rounding_method', 0),
(2, 'rounding_unit', 100),
(2, 'card_fee_rate', 0),
(2, 'business_day_cutoff_hour', 6)
ON CONFLICT (store_id, setting_key) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

-- Insert default store_settings for store_id=2
INSERT INTO store_settings (store_id, setting_name, setting_value) VALUES
(2, 'store_name', '2'),
(2, 'timezone', '9'),
(2, 'currency', '0'),
(2, 'tax_display_mode', '1')
ON CONFLICT (store_id, setting_name) DO UPDATE
SET setting_value = EXCLUDED.setting_value;

-- Verify the data was inserted
SELECT 'system_settings' as table_name, COUNT(*) as row_count FROM system_settings WHERE store_id = 2
UNION ALL
SELECT 'store_settings' as table_name, COUNT(*) as row_count FROM store_settings WHERE store_id = 2;
