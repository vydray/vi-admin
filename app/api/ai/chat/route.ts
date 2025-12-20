import { NextRequest, NextResponse } from 'next/server';
import { processChatMessage } from '../../../../lib/ai/claude';
import { createClient } from '@supabase/supabase-js';

// Supabase Admin Client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { castId, lineUserId, storeId, message, conversationContext } = body;

    if (!castId || !lineUserId || !storeId || !message) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // キャスト情報を取得
    const { data: cast, error: castError } = await supabase
      .from('casts')
      .select('id, name, store_id')
      .eq('id', castId)
      .eq('store_id', storeId)
      .single();

    if (castError || !cast) {
      return NextResponse.json(
        { error: 'Cast not found' },
        { status: 404 }
      );
    }

    // Claude APIで会話を処理
    const result = await processChatMessage({
      castId: cast.id,
      castName: cast.name,
      storeId: cast.store_id,
      lineUserId,
      userMessage: message,
      conversationContext,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Chat API error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
