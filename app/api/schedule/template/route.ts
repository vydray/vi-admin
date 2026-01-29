import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// セッション検証関数
async function validateSession(): Promise<{ storeId: number; isAllStore: boolean } | null> {
  const cookieStore = await cookies()
  const sessionCookie = cookieStore.get('admin_session')
  if (!sessionCookie) return null

  try {
    const session = JSON.parse(sessionCookie.value)
    return {
      storeId: session.storeId,
      isAllStore: session.isAllStore || false
    }
  } catch {
    return null
  }
}

// GET: 店舗のテンプレートを取得
export async function GET(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url);
    const storeId = searchParams.get('storeId');

    if (!storeId) {
      return NextResponse.json(
        { error: 'Missing storeId' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from('store_schedule_templates')
      .select('*')
      .eq('store_id', parseInt(storeId))
      .single();

    if (error && error.code !== 'PGRST116') {
      console.error('Get template error:', error);
      return NextResponse.json(
        { error: 'Failed to get template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ template: data || null });
  } catch (error) {
    console.error('Get template error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST: テンプレート画像をアップロード
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const storeId = formData.get('storeId') as string;
    const type = formData.get('type') as string; // 'template' or 'placeholder'

    if (!file || !storeId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = type === 'placeholder'
      ? `${storeId}/placeholder.png`
      : `${storeId}/template.png`;

    // 既存ファイルを削除
    await supabase.storage.from('schedule-templates').remove([fileName]);

    // 新しいファイルをアップロード
    const { error: uploadError } = await supabase.storage
      .from('schedule-templates')
      .upload(fileName, buffer, {
        contentType: 'image/png',
        upsert: true,
      });

    if (uploadError) {
      console.error('Upload error:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file' },
        { status: 500 }
      );
    }

    // 公開URLを取得
    const { data: urlData } = supabase.storage
      .from('schedule-templates')
      .getPublicUrl(fileName);

    return NextResponse.json({
      success: true,
      path: fileName,
      url: urlData.publicUrl,
    });
  } catch (error) {
    console.error('Template upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT: テンプレート設定を更新
export async function PUT(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json();
    const { storeId, name, mode, imagePath, placeholderPath, frames, frameSize, nameStyle, gridSettings } = body;

    if (!storeId) {
      return NextResponse.json(
        { error: 'Missing storeId' },
        { status: 400 }
      );
    }

    // upsert: 存在すれば更新、なければ作成
    const { data, error } = await supabase
      .from('store_schedule_templates')
      .upsert(
        {
          store_id: storeId,
          name: name || null,
          mode: mode || 'custom',
          image_path: imagePath,
          placeholder_path: placeholderPath || null,
          frames: frames || [],
          frame_size: frameSize || { width: 150, height: 200 },
          // デフォルト値と提供された値をマージ（提供された値が優先）
          name_style: {
            font_size: 24,
            font_family: 'Rounded Mplus 1c',
            font_weight: '700',
            color: '#FFFFFF',
            stroke_enabled: true,
            stroke_color: '#000000',
            stroke_width: 2,
            offset_y: 10,
            ...nameStyle,
          },
          grid_settings: gridSettings || {
            columns: 4,
            rows: 2,
            photo_width: 300,
            photo_height: 400,
            gap: 10,
            background_color: '#ffffff',
            show_names: false,
          },
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'store_id' }
      )
      .select()
      .single();

    if (error) {
      console.error('Update template error:', error);
      return NextResponse.json(
        { error: 'Failed to update template' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, template: data });
  } catch (error) {
    console.error('Update template error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
