'use client';

import { useState, useEffect } from 'react';
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs';
import ProtectedPage from '@/components/ProtectedPage';

interface Store {
  id: number;
  store_name: string;
}

interface AISettings {
  advance_absence_deadline_days_before: string;
  advance_absence_deadline_time: string;
  public_absence_receipt_deadline_days: string;
  request_shift_requires_approval: boolean;
  advance_absence_requires_approval: boolean;
  same_day_absence_requires_approval: boolean;
  public_absence_requires_approval: boolean;
  request_shift_approval_roles: string;
  advance_absence_approval_roles: string;
  same_day_absence_approval_roles: string;
  public_absence_approval_roles: string;
  discord_notify_auto_approved: boolean;
  discord_webhook_url: string;
  reminder_shift_confirmation_enabled: boolean;
  reminder_shift_confirmation_time: string;
  reminder_public_absence_receipt_enabled: boolean;
  reminder_unapproved_requests_enabled: boolean;
  reminder_unapproved_requests_mode: string;
  reminder_unapproved_requests_times: string;
  reminder_shift_submission_enabled: boolean;
  reminder_shift_submission_days: string;
  reminder_payslip_enabled: boolean;
  reminder_payslip_day: string;
  ai_request_max_future_months: string;
}

export default function AISettingsPage() {
  return (
    <ProtectedPage requireSuperAdmin>
      <AISettingsPageContent />
    </ProtectedPage>
  );
}

function AISettingsPageContent() {
  const supabase = createClientComponentClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [selectedStoreId, setSelectedStoreId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState<AISettings>({
    advance_absence_deadline_days_before: '1',
    advance_absence_deadline_time: '23:59',
    public_absence_receipt_deadline_days: '2',
    request_shift_requires_approval: false,
    advance_absence_requires_approval: false,
    same_day_absence_requires_approval: false,
    public_absence_requires_approval: true,
    request_shift_approval_roles: 'admin,manager',
    advance_absence_approval_roles: 'admin,manager',
    same_day_absence_approval_roles: 'admin,manager',
    public_absence_approval_roles: 'admin,manager',
    discord_notify_auto_approved: true,
    discord_webhook_url: '',
    reminder_shift_confirmation_enabled: true,
    reminder_shift_confirmation_time: '13:00',
    reminder_public_absence_receipt_enabled: true,
    reminder_unapproved_requests_enabled: true,
    reminder_unapproved_requests_mode: 'realtime',
    reminder_unapproved_requests_times: '09:00,18:00',
    reminder_shift_submission_enabled: true,
    reminder_shift_submission_days: '15,20',
    reminder_payslip_enabled: true,
    reminder_payslip_day: '25',
    ai_request_max_future_months: '2',
  });

  // 店舗リスト取得
  useEffect(() => {
    fetchStores();
  }, []);

  // 店舗変更時に設定を取得
  useEffect(() => {
    if (selectedStoreId) {
      fetchSettings();
    }
  }, [selectedStoreId]);

  const fetchStores = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .order('id');

    if (error) {
      console.error('Failed to fetch stores:', error);
    } else if (data) {
      // store_nameフィールドをマッピング
      const mappedStores = data.map(store => ({
        id: store.id,
        store_name: store.store_name
      }));
      setStores(mappedStores);
      if (mappedStores.length > 0) {
        setSelectedStoreId(mappedStores[0].id);
      }
    }
    setLoading(false);
  };

  const fetchSettings = async () => {
    if (!selectedStoreId) return;

    setLoading(true);
    const { data, error } = await supabase
      .from('system_settings')
      .select('setting_key, setting_value')
      .eq('store_id', selectedStoreId);

    if (!error && data) {
      const newSettings: any = { ...settings };
      data.forEach((row) => {
        const value = row.setting_value;
        if (row.setting_key.includes('requires_approval') || row.setting_key.includes('_enabled') || row.setting_key === 'discord_notify_auto_approved') {
          newSettings[row.setting_key] = value === 'true';
        } else {
          newSettings[row.setting_key] = value;
        }
      });
      setSettings(newSettings);
    }
    setLoading(false);
  };

  const handleSave = async () => {
    if (!selectedStoreId) return;

    setSaving(true);

    const updates = Object.entries(settings).map(([key, value]) => ({
      store_id: selectedStoreId,
      setting_key: key,
      setting_value: typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value),
    }));

    for (const update of updates) {
      await supabase
        .from('system_settings')
        .upsert({
          store_id: update.store_id,
          setting_key: update.setting_key,
          setting_value: update.setting_value,
        });
    }

    setSaving(false);
    alert('設定を保存しました');
  };

  return (
    <div style={{
      display: 'flex',
      height: 'calc(100vh - 60px)',
      backgroundColor: '#f7f9fc',
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
    }}>
      {/* 左サイドバー: 店舗一覧 */}
      <div style={{
        width: '280px',
        backgroundColor: '#fff',
        borderRight: '1px solid #e2e8f0',
        display: 'flex',
        flexDirection: 'column'
      }}>
        <div style={{
          padding: '20px',
          borderBottom: '1px solid #e2e8f0'
        }}>
          <h2 style={{ fontSize: '18px', fontWeight: 'bold', margin: 0, color: '#1a1a1a' }}>
            AI統合設定
          </h2>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#94a3b8' }}>
              読み込み中...
            </div>
          ) : stores.length === 0 ? (
            <div style={{ padding: '20px', textAlign: 'center', color: '#ef4444' }}>
              店舗が見つかりません
            </div>
          ) : (
            stores.map(store => (
              <div
                key={store.id}
                onClick={() => setSelectedStoreId(store.id)}
                style={{
                  padding: '14px 20px',
                  cursor: 'pointer',
                  backgroundColor: selectedStoreId === store.id ? '#f0f9ff' : 'transparent',
                  borderLeft: selectedStoreId === store.id ? '3px solid #3b82f6' : '3px solid transparent',
                  borderBottom: '1px solid #f1f5f9',
                  transition: 'all 0.15s'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#22c55e'
                  }} />
                  <span style={{
                    fontWeight: selectedStoreId === store.id ? '600' : '400',
                    color: '#1a1a1a',
                    fontSize: '14px'
                  }}>
                    {store.store_name}
                  </span>
                </div>
                <div style={{ marginLeft: '18px', marginTop: '4px' }}>
                  <code style={{ fontSize: '11px', color: '#94a3b8' }}>ID: {store.id}</code>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* 右側: 設定内容 */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {selectedStoreId && (
          <div style={{ marginBottom: '24px' }}>
            <h1 style={{ fontSize: '24px', fontWeight: '600', color: '#1a1a1a', marginBottom: '8px' }}>
              {stores.find(s => s.id === selectedStoreId)?.store_name}
            </h1>
            <p style={{ fontSize: '14px', color: '#64748b' }}>
              AI統合設定を管理
            </p>
          </div>
        )}

      {/* 期限設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>期限設定</h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '12px' }}>
            事前欠勤の締切
          </label>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                何日前
              </label>
              <input
                type="number"
                min="0"
                value={settings.advance_absence_deadline_days_before}
                onChange={(e) => setSettings({ ...settings, advance_absence_deadline_days_before: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
            </div>
            <div style={{ flex: 1 }}>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                その日の何時まで
              </label>
              <input
                type="time"
                value={settings.advance_absence_deadline_time}
                onChange={(e) => setSettings({ ...settings, advance_absence_deadline_time: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
            </div>
          </div>
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            例：出勤日の1日前の23:59まで
          </p>
        </div>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
            公欠証明の提出期限（欠勤日含めて何日以内）
          </label>
          <input
            type="number"
            min="1"
            value={settings.public_absence_receipt_deadline_days}
            onChange={(e) => setSettings({ ...settings, public_absence_receipt_deadline_days: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
            }}
          />
          <p style={{ fontSize: '12px', color: '#64748b', marginTop: '6px' }}>
            当日欠勤を公欠に変更するための証明書提出期限
          </p>
        </div>
      </section>

      {/* 承認要否設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>承認要否設定</h2>

        {[
          { key: 'request_shift_requires_approval', label: 'リクエスト出勤' },
          { key: 'advance_absence_requires_approval', label: '事前欠勤' },
          { key: 'same_day_absence_requires_approval', label: '当日欠勤' },
          { key: 'public_absence_requires_approval', label: '公欠申請' },
        ].map((item) => (
          <label
            key={item.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 0',
              borderBottom: '1px solid #f1f5f9',
            }}
          >
            <span style={{ fontSize: '14px' }}>{item.label}</span>
            <input
              type="checkbox"
              checked={settings[item.key as keyof AISettings] as boolean}
              onChange={(e) => setSettings({ ...settings, [item.key]: e.target.checked })}
              style={{ width: '20px', height: '20px' }}
            />
          </label>
        ))}
      </section>

      {/* 承認ロール設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>承認ロール設定</h2>
        <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
          各申請タイプを承認できるロールを選択してください
        </p>

        {[
          { key: 'request_shift_approval_roles', label: 'リクエスト出勤' },
          { key: 'advance_absence_approval_roles', label: '事前欠勤' },
          { key: 'same_day_absence_approval_roles', label: '当日欠勤' },
          { key: 'public_absence_approval_roles', label: '公欠申請' },
        ].map((item) => {
          const currentRoles = (settings[item.key as keyof AISettings] as string).split(',');
          const hasAdmin = currentRoles.includes('admin');
          const hasManager = currentRoles.includes('manager');

          const handleRoleChange = (role: string, checked: boolean) => {
            let roles = currentRoles.filter(r => r.trim());
            if (checked) {
              if (!roles.includes(role)) {
                roles.push(role);
              }
            } else {
              roles = roles.filter(r => r !== role);
            }
            // 少なくとも1つのロールは必要
            if (roles.length === 0) {
              roles = ['admin'];
            }
            setSettings({ ...settings, [item.key]: roles.join(',') });
          };

          return (
            <div
              key={item.key}
              style={{
                padding: '12px 0',
                borderBottom: '1px solid #f1f5f9',
              }}
            >
              <div style={{ fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
                {item.label}
              </div>
              <div style={{ display: 'flex', gap: '16px', paddingLeft: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasAdmin}
                    onChange={(e) => handleRoleChange('admin', e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '14px' }}>管理者</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={hasManager}
                    onChange={(e) => handleRoleChange('manager', e.target.checked)}
                    style={{ width: '18px', height: '18px' }}
                  />
                  <span style={{ fontSize: '14px' }}>マネージャー</span>
                </label>
              </div>
            </div>
          );
        })}
      </section>

      {/* Discord通知設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>Discord通知設定</h2>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
            Discord Webhook URL
          </label>
          <input
            type="text"
            value={settings.discord_webhook_url}
            onChange={(e) => setSettings({ ...settings, discord_webhook_url: e.target.value })}
            placeholder="https://discord.com/api/webhooks/..."
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
            }}
          />
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
          }}
        >
          <span style={{ fontSize: '14px' }}>即反映時もDiscord通知を送る</span>
          <input
            type="checkbox"
            checked={settings.discord_notify_auto_approved}
            onChange={(e) => setSettings({ ...settings, discord_notify_auto_approved: e.target.checked })}
            style={{ width: '20px', height: '20px' }}
          />
        </label>
      </section>

      {/* リマインダー設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>リマインダー設定</h2>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '500' }}>当日シフト確認リマインダー</span>
            <input
              type="checkbox"
              checked={settings.reminder_shift_confirmation_enabled}
              onChange={(e) => setSettings({ ...settings, reminder_shift_confirmation_enabled: e.target.checked })}
              style={{ width: '20px', height: '20px' }}
            />
          </label>
          {settings.reminder_shift_confirmation_enabled && (
            <input
              type="time"
              value={settings.reminder_shift_confirmation_time}
              onChange={(e) => setSettings({ ...settings, reminder_shift_confirmation_time: e.target.value })}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '6px',
                border: '1px solid #e2e8f0',
                fontSize: '14px',
              }}
            />
          )}
        </div>

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: '1px solid #f1f5f9',
          }}
        >
          <span style={{ fontSize: '14px' }}>公欠証明提出期限リマインダー</span>
          <input
            type="checkbox"
            checked={settings.reminder_public_absence_receipt_enabled}
            onChange={(e) => setSettings({ ...settings, reminder_public_absence_receipt_enabled: e.target.checked })}
            style={{ width: '20px', height: '20px' }}
          />
        </label>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '500' }}>シフト提出期限リマインダー</span>
            <input
              type="checkbox"
              checked={settings.reminder_shift_submission_enabled}
              onChange={(e) => setSettings({ ...settings, reminder_shift_submission_enabled: e.target.checked })}
              style={{ width: '20px', height: '20px' }}
            />
          </label>
          {settings.reminder_shift_submission_enabled && (
            <>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                毎月何日にリマインドするか（カンマ区切り）
              </label>
              <input
                type="text"
                value={settings.reminder_shift_submission_days}
                onChange={(e) => setSettings({ ...settings, reminder_shift_submission_days: e.target.value })}
                placeholder="15,20"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
            </>
          )}
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: '8px',
            }}
          >
            <span style={{ fontSize: '14px', fontWeight: '500' }}>給与明細確認リマインダー</span>
            <input
              type="checkbox"
              checked={settings.reminder_payslip_enabled}
              onChange={(e) => setSettings({ ...settings, reminder_payslip_enabled: e.target.checked })}
              style={{ width: '20px', height: '20px' }}
            />
          </label>
          {settings.reminder_payslip_enabled && (
            <>
              <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>
                毎月何日にリマインドするか
              </label>
              <input
                type="text"
                value={settings.reminder_payslip_day}
                onChange={(e) => setSettings({ ...settings, reminder_payslip_day: e.target.value })}
                placeholder="25"
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                }}
              />
            </>
          )}
        </div>

        <div style={{ marginTop: '16px' }}>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '8px' }}>
            未承認申請リマインダー
          </label>
          <label style={{ display: 'flex', alignItems: 'center', marginBottom: '8px' }}>
            <input
              type="checkbox"
              checked={settings.reminder_unapproved_requests_enabled}
              onChange={(e) => setSettings({ ...settings, reminder_unapproved_requests_enabled: e.target.checked })}
              style={{ width: '20px', height: '20px', marginRight: '8px' }}
            />
            <span style={{ fontSize: '14px' }}>有効</span>
          </label>
          {settings.reminder_unapproved_requests_enabled && (
            <>
              <select
                value={settings.reminder_unapproved_requests_mode}
                onChange={(e) => setSettings({ ...settings, reminder_unapproved_requests_mode: e.target.value })}
                style={{
                  width: '100%',
                  padding: '10px',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                  fontSize: '14px',
                  marginBottom: '8px',
                }}
              >
                <option value="realtime">リアルタイム（申請後すぐ）</option>
                <option value="scheduled">スケジュール（指定時刻）</option>
              </select>
              {settings.reminder_unapproved_requests_mode === 'scheduled' && (
                <input
                  type="text"
                  value={settings.reminder_unapproved_requests_times}
                  onChange={(e) => setSettings({ ...settings, reminder_unapproved_requests_times: e.target.value })}
                  placeholder="09:00,18:00"
                  style={{
                    width: '100%',
                    padding: '10px',
                    borderRadius: '6px',
                    border: '1px solid #e2e8f0',
                    fontSize: '14px',
                  }}
                />
              )}
            </>
          )}
        </div>
      </section>

      {/* AI制限設定 */}
      <section style={{ backgroundColor: '#fff', borderRadius: '8px', padding: '16px', marginBottom: '12px' }}>
        <h2 style={{ fontSize: '16px', fontWeight: '600', marginBottom: '12px' }}>AI制限設定</h2>

        <div>
          <label style={{ display: 'block', fontSize: '14px', fontWeight: '500', marginBottom: '6px' }}>
            リクエスト出勤の最大未来月数
          </label>
          <input
            type="number"
            value={settings.ai_request_max_future_months}
            onChange={(e) => setSettings({ ...settings, ai_request_max_future_months: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              borderRadius: '6px',
              border: '1px solid #e2e8f0',
              fontSize: '14px',
            }}
          />
        </div>
      </section>

      {/* 保存ボタン */}
      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '14px',
          backgroundColor: '#2563eb',
          color: '#fff',
          border: 'none',
          borderRadius: '8px',
          fontSize: '16px',
          fontWeight: '600',
          cursor: saving ? 'not-allowed' : 'pointer',
          opacity: saving ? 0.5 : 1,
        }}
      >
        {saving ? '保存中...' : '設定を保存'}
      </button>
      </div>
    </div>
  );
}
