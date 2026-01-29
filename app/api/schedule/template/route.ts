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

    // 必須フィールドチェック
    if (!storeId) {
      return NextResponse.json(
        { error: 'storeId is required' },
        { status: 400 }
      );
    }

    // storeId の型チェック
    if (typeof storeId !== 'number' || storeId <= 0) {
      return NextResponse.json(
        { error: 'Invalid storeId format' },
        { status: 400 }
      );
    }

    // name の型チェック（任意）
    if (name !== undefined && name !== null && typeof name !== 'string') {
      return NextResponse.json(
        { error: 'Invalid name format' },
        { status: 400 }
      );
    }

    // mode の型チェック（任意）
    if (mode !== undefined && typeof mode !== 'string') {
      return NextResponse.json(
        { error: 'Invalid mode format' },
        { status: 400 }
      );
    }

    // imagePath の型チェック（任意）
    if (imagePath !== undefined && imagePath !== null && typeof imagePath !== 'string') {
      return NextResponse.json(
        { error: 'Invalid imagePath format' },
        { status: 400 }
      );
    }

    // placeholderPath の型チェック（任意）
    if (placeholderPath !== undefined && placeholderPath !== null && typeof placeholderPath !== 'string') {
      return NextResponse.json(
        { error: 'Invalid placeholderPath format' },
        { status: 400 }
      );
    }

    // frames の配列サイズ制限（DoS対策）
    if (frames !== undefined) {
      if (!Array.isArray(frames)) {
        return NextResponse.json(
          { error: 'frames must be an array' },
          { status: 400 }
        );
      }
      if (frames.length > 100) {
        return NextResponse.json(
          { error: 'Too many frames (max 100)' },
          { status: 400 }
        );
      }
      // 各フレームの型チェック
      for (const frame of frames) {
        if (typeof frame !== 'object' || frame === null) {
          return NextResponse.json(
            { error: 'Invalid frame format' },
            { status: 400 }
          );
        }
        // x, y の型チェック
        if (typeof frame.x !== 'number' || typeof frame.y !== 'number') {
          return NextResponse.json(
            { error: 'Frame x and y must be numbers' },
            { status: 400 }
          );
        }
      }
    }

    // frameSize の型チェック
    if (frameSize !== undefined) {
      if (typeof frameSize !== 'object' || frameSize === null) {
        return NextResponse.json(
          { error: 'Invalid frameSize format' },
          { status: 400 }
        );
      }
      if (typeof frameSize.width !== 'number' || typeof frameSize.height !== 'number') {
        return NextResponse.json(
          { error: 'frameSize width and height must be numbers' },
          { status: 400 }
        );
      }
      // サイズの妥当性チェック
      if (frameSize.width <= 0 || frameSize.height <= 0 || frameSize.width > 10000 || frameSize.height > 10000) {
        return NextResponse.json(
          { error: 'Invalid frameSize dimensions (1-10000)' },
          { status: 400 }
        );
      }
    }

    // nameStyle の型チェック
    if (nameStyle !== undefined) {
      if (typeof nameStyle !== 'object' || nameStyle === null) {
        return NextResponse.json(
          { error: 'Invalid nameStyle format' },
          { status: 400 }
        );
      }
      // 各プロパティの型チェック
      if (nameStyle.font_size !== undefined && typeof nameStyle.font_size !== 'number') {
        return NextResponse.json(
          { error: 'nameStyle.font_size must be a number' },
          { status: 400 }
        );
      }
      if (nameStyle.font_family !== undefined && typeof nameStyle.font_family !== 'string') {
        return NextResponse.json(
          { error: 'nameStyle.font_family must be a string' },
          { status: 400 }
        );
      }
      if (nameStyle.color !== undefined && typeof nameStyle.color !== 'string') {
        return NextResponse.json(
          { error: 'nameStyle.color must be a string' },
          { status: 400 }
        );
      }
    }

    // gridSettings の型チェック
    if (gridSettings !== undefined) {
      if (typeof gridSettings !== 'object' || gridSettings === null) {
        return NextResponse.json(
          { error: 'Invalid gridSettings format' },
          { status: 400 }
        );
      }
      // 各プロパティの型チェック
      if (gridSettings.columns !== undefined && typeof gridSettings.columns !== 'number') {
        return NextResponse.json(
          { error: 'gridSettings.columns must be a number' },
          { status: 400 }
        );
      }
      if (gridSettings.rows !== undefined && typeof gridSettings.rows !== 'number') {
        return NextResponse.json(
          { error: 'gridSettings.rows must be a number' },
          { status: 400 }
        );
      }
      if (gridSettings.photo_width !== undefined && typeof gridSettings.photo_width !== 'number') {
        return NextResponse.json(
          { error: 'gridSettings.photo_width must be a number' },
          { status: 400 }
        );
      }
      if (gridSettings.photo_height !== undefined && typeof gridSettings.photo_height !== 'number') {
        return NextResponse.json(
          { error: 'gridSettings.photo_height must be a number' },
          { status: 400 }
        );
      }
      if (gridSettings.gap !== undefined && typeof gridSettings.gap !== 'number') {
        return NextResponse.json(
          { error: 'gridSettings.gap must be a number' },
          { status: 400 }
        );
      }
      if (gridSettings.background_color !== undefined && typeof gridSettings.background_color !== 'string') {
        return NextResponse.json(
          { error: 'gridSettings.background_color must be a string' },
          { status: 400 }
        );
      }
      if (gridSettings.show_names !== undefined && typeof gridSettings.show_names !== 'boolean') {
        return NextResponse.json(
          { error: 'gridSettings.show_names must be a boolean' },
          { status: 400 }
        );
      }
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
    // JSON パースエラーの場合
    if (error instanceof SyntaxError) {
      return NextResponse.json(
        { error: 'Invalid JSON format' },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
