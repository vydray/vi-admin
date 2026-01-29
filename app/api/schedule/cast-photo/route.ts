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

// photo_cropの型定義
interface PhotoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

// 許可されたファイルタイプ
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png']
const MAX_FILE_SIZE = 5 * 1024 * 1024 // 5MB

// POST: キャスト写真をアップロード（元画像をそのまま保存）
export async function POST(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const castId = formData.get('castId') as string;
    const storeId = formData.get('storeId') as string;
    // 切り抜き設定（オプション）
    const photoCropStr = formData.get('photoCrop') as string | null;

    if (!file || !castId || !storeId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // ファイルサイズチェック
    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: `File size exceeds ${MAX_FILE_SIZE / (1024 * 1024)}MB limit` },
        { status: 400 }
      );
    }

    // MIMEタイプチェック（画像のみ）
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: 'Invalid file type. Only JPEG and PNG images are allowed' },
        { status: 400 }
      );
    }

    // photo_cropをパース
    let photoCrop: PhotoCrop | null = null;
    if (photoCropStr) {
      try {
        photoCrop = JSON.parse(photoCropStr);
        // photo_cropの値が正の数かチェック
        if (photoCrop && (
          photoCrop.x < 0 || photoCrop.y < 0 ||
          photoCrop.width <= 0 || photoCrop.height <= 0
        )) {
          return NextResponse.json(
            { error: 'Invalid photoCrop values' },
            { status: 400 }
          );
        }
      } catch {
        // パース失敗時は無視
      }
    }

    // ファイルをBufferに変換（元画像をそのまま保存）
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileName = `${storeId}/${castId}.jpg`;

    // 既存ファイルを削除（あれば）
    await supabase.storage.from('cast-photos').remove([fileName]);

    // 新しいファイルをアップロード
    const { error: uploadError } = await supabase.storage
      .from('cast-photos')
      .upload(fileName, buffer, {
        contentType: 'image/jpeg',
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
      .from('cast-photos')
      .getPublicUrl(fileName);

    // castsテーブルを更新（photo_pathとphoto_crop）
    // photo_cropが指定されていればその値、なければnullを設定
    const updateData: { photo_path: string; photo_crop: PhotoCrop | null } = {
      photo_path: fileName,
      photo_crop: photoCrop, // nullまたは切り抜き設定
    };

    const { error: updateError } = await supabase
      .from('casts')
      .update(updateData)
      .eq('id', parseInt(castId))
      .eq('store_id', parseInt(storeId));

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update cast' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      path: fileName,
      url: urlData.publicUrl,
      photoCrop,
    });
  } catch (error) {
    console.error('Cast photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH: 切り抜き設定のみを更新
export async function PATCH(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await request.json();
    const { castId, storeId, photoCrop } = body as {
      castId: number;
      storeId: number;
      photoCrop: PhotoCrop;
    };

    if (!castId || !storeId || !photoCrop) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // castsテーブルのphoto_cropを更新
    const { error: updateError } = await supabase
      .from('casts')
      .update({ photo_crop: photoCrop })
      .eq('id', castId)
      .eq('store_id', storeId);

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update photo crop' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      photoCrop,
    });
  } catch (error) {
    console.error('Update photo crop error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: キャスト写真を削除
export async function DELETE(request: NextRequest) {
  const session = await validateSession()
  if (!session) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url);
    const castId = searchParams.get('castId');
    const storeId = searchParams.get('storeId');

    if (!castId || !storeId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    const fileName = `${storeId}/${castId}.jpg`;

    // Storageからファイルを削除
    const { error: deleteError } = await supabase.storage
      .from('cast-photos')
      .remove([fileName]);

    if (deleteError) {
      console.error('Delete error:', deleteError);
    }

    // castsテーブルを更新
    const { error: updateError } = await supabase
      .from('casts')
      .update({ photo_path: null })
      .eq('id', parseInt(castId))
      .eq('store_id', parseInt(storeId));

    if (updateError) {
      console.error('Update error:', updateError);
      return NextResponse.json(
        { error: 'Failed to update cast' },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Cast photo delete error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
