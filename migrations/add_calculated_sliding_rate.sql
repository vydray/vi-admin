-- 計算済みスライドバック率カラムとトリガーのマイグレーション
-- 実行方法: Supabase Dashboard > SQL Editor で実行

-- ============================================
-- 1. cast_back_rates テーブルに計算結果カラムを追加
-- ============================================

-- 計算済みスライドバック率
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS calculated_sliding_rate DECIMAL(5,2);

-- 計算日時
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS calculated_at TIMESTAMP WITH TIME ZONE;

-- 計算時の累計売上（参考用）
ALTER TABLE cast_back_rates
ADD COLUMN IF NOT EXISTS calculated_sales_amount INTEGER;

COMMENT ON COLUMN cast_back_rates.calculated_sliding_rate IS '計算済みのスライドバック率 (会計時に自動更新)';
COMMENT ON COLUMN cast_back_rates.calculated_at IS 'スライドバック率の計算日時';
COMMENT ON COLUMN cast_back_rates.calculated_sales_amount IS '計算時の累計売上金額';

-- ============================================
-- 2. スライドバック率計算関数
-- ============================================

CREATE OR REPLACE FUNCTION calculate_sliding_back_rate()
RETURNS TRIGGER AS $$
DECLARE
    v_cast_name TEXT;
    v_cast_id INTEGER;
    v_store_id INTEGER;
    v_month_start DATE;
    v_month_end DATE;
    v_back_rate RECORD;
    v_cumulative_sales INTEGER;
    v_applicable_rate DECIMAL(5,2);
    v_sliding_entry JSONB;
BEGIN
    -- 削除された伝票は処理しない
    IF NEW.deleted_at IS NOT NULL THEN
        RETURN NEW;
    END IF;

    v_store_id := NEW.store_id;
    v_month_start := DATE_TRUNC('month', NEW.checkout_datetime::DATE);
    v_month_end := (DATE_TRUNC('month', NEW.checkout_datetime::DATE) + INTERVAL '1 month')::DATE;

    -- この伝票のorder_itemsに関連するキャスト名を取得
    FOR v_cast_name IN
        SELECT DISTINCT unnest(
            CASE
                WHEN jsonb_typeof(to_jsonb(oi.cast_name)) = 'array' THEN
                    ARRAY(SELECT jsonb_array_elements_text(to_jsonb(oi.cast_name)))
                WHEN oi.cast_name IS NOT NULL AND oi.cast_name != '' THEN
                    ARRAY[oi.cast_name::TEXT]
                ELSE
                    ARRAY[]::TEXT[]
            END
        ) AS cast_name
        FROM order_items oi
        WHERE oi.order_id = NEW.id
          AND oi.cast_name IS NOT NULL
    LOOP
        -- キャスト名からキャストIDを取得
        SELECT id INTO v_cast_id
        FROM casts
        WHERE name = v_cast_name AND store_id = v_store_id
        LIMIT 1;

        IF v_cast_id IS NULL THEN
            CONTINUE;
        END IF;

        -- このキャストのスライドバック率設定を取得
        FOR v_back_rate IN
            SELECT *
            FROM cast_back_rates
            WHERE cast_id = v_cast_id
              AND store_id = v_store_id
              AND use_sliding_back = true
              AND is_active = true
              AND sliding_back_rates IS NOT NULL
        LOOP
            -- 累計売上を計算
            IF v_back_rate.back_sales_aggregation = 'receipt_based' THEN
                -- 伝票小計: このキャストが関わった伝票の合計
                SELECT COALESCE(SUM(o.subtotal_excl_tax), 0) INTO v_cumulative_sales
                FROM orders o
                JOIN order_items oi ON oi.order_id = o.id
                WHERE o.store_id = v_store_id
                  AND o.deleted_at IS NULL
                  AND o.checkout_datetime >= v_month_start
                  AND o.checkout_datetime < v_month_end
                  AND (
                      (jsonb_typeof(to_jsonb(oi.cast_name)) = 'array' AND to_jsonb(oi.cast_name) ? v_cast_name)
                      OR oi.cast_name::TEXT = v_cast_name
                  );
            ELSE
                -- 推し小計: このキャストの商品売上合計
                SELECT COALESCE(SUM(oi.subtotal), 0) INTO v_cumulative_sales
                FROM order_items oi
                JOIN orders o ON o.id = oi.order_id
                WHERE o.store_id = v_store_id
                  AND o.deleted_at IS NULL
                  AND o.checkout_datetime >= v_month_start
                  AND o.checkout_datetime < v_month_end
                  AND (
                      (jsonb_typeof(to_jsonb(oi.cast_name)) = 'array' AND to_jsonb(oi.cast_name) ? v_cast_name)
                      OR oi.cast_name::TEXT = v_cast_name
                  );
            END IF;

            -- スライドテーブルから該当レートを取得（minで降順ソートして最初にマッチするもの）
            v_applicable_rate := NULL;
            FOR v_sliding_entry IN
                SELECT * FROM jsonb_array_elements(v_back_rate.sliding_back_rates)
                ORDER BY (value->>'min')::INTEGER DESC
            LOOP
                IF v_cumulative_sales >= (v_sliding_entry->>'min')::INTEGER THEN
                    v_applicable_rate := (v_sliding_entry->>'rate')::DECIMAL(5,2);
                    EXIT;
                END IF;
            END LOOP;

            -- calculated_sliding_rateを更新
            IF v_applicable_rate IS NOT NULL THEN
                UPDATE cast_back_rates
                SET calculated_sliding_rate = v_applicable_rate,
                    calculated_at = NOW(),
                    calculated_sales_amount = v_cumulative_sales
                WHERE id = v_back_rate.id;
            END IF;
        END LOOP;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- 3. トリガー作成
-- ============================================

-- 既存のトリガーがあれば削除
DROP TRIGGER IF EXISTS trigger_calculate_sliding_back_rate ON orders;

-- 伝票作成時にスライドバック率を計算
CREATE TRIGGER trigger_calculate_sliding_back_rate
AFTER INSERT ON orders
FOR EACH ROW
EXECUTE FUNCTION calculate_sliding_back_rate();

-- ============================================
-- 確認用クエリ
-- ============================================
-- SELECT id, cast_id, category, product_name, use_sliding_back, calculated_sliding_rate, calculated_at, calculated_sales_amount
-- FROM cast_back_rates
-- WHERE use_sliding_back = true;
