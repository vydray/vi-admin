import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

// POST: キャスト写真をアップロード
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const castId = formData.get('castId') as string;
    const storeId = formData.get('storeId') as string;

    if (!file || !castId || !storeId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // ファイルをBufferに変換
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

    // castsテーブルを更新
    const { error: updateError } = await supabase
      .from('casts')
      .update({ photo_path: fileName })
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
    });
  } catch (error) {
    console.error('Cast photo upload error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE: キャスト写真を削除
export async function DELETE(request: NextRequest) {
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
