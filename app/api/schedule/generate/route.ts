import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createCanvas, registerFont } from 'canvas';
import path from 'path';
import fs from 'fs';

// M PLUS Rounded 1c のウェイト定義（Boldは別ファミリー名として登録、weightも指定）
const MPLUS_FONTS = [
  { file: 'MPLUSRounded1c-Regular.ttf', family: 'Rounded Mplus 1c', weight: 'normal' as const },
  { file: 'MPLUSRounded1c-Bold.ttf', family: 'Rounded Mplus 1c Bold', weight: 'bold' as const },
];

// 他のフォント（Boldバリアントは別ファミリー名として登録、weightも指定）
const OTHER_FONTS = [
  { file: 'KosugiMaru-Regular.ttf', family: 'Kosugi Maru', weight: 'normal' as const },
  { file: 'HachiMaruPop-Regular.ttf', family: 'Hachi Maru Pop', weight: 'normal' as const },
  { file: 'YuseiMagic-Regular.ttf', family: 'Yusei Magic', weight: 'normal' as const },
  { file: 'ZenMaruGothic-Regular.ttf', family: 'Zen Maru Gothic', weight: 'normal' as const },
  { file: 'ZenMaruGothic-Bold.ttf', family: 'Zen Maru Gothic Bold', weight: 'bold' as const },
  { file: 'DelaGothicOne-Regular.ttf', family: 'Dela Gothic One', weight: 'normal' as const },
  { file: 'ReggaeOne-Regular.ttf', family: 'Reggae One', weight: 'normal' as const },
  { file: 'RocknRollOne-Regular.ttf', family: 'RocknRoll One', weight: 'normal' as const },
];

// フォントを登録（サーバー起動時に1回だけ実行される）
let fontsRegistered = false;
let fontRegistrationLog: string[] = [];

function ensureFontsRegistered() {
  if (fontsRegistered) return;
  fontRegistrationLog = [];
  try {
    const fontsDir = path.join(process.cwd(), 'public', 'fonts');
    fontRegistrationLog.push(`Fonts directory: ${fontsDir}`);

    // ディレクトリの存在確認
    if (fs.existsSync(fontsDir)) {
      const files = fs.readdirSync(fontsDir);
      fontRegistrationLog.push(`Found ${files.length} files in fonts dir`);
    } else {
      fontRegistrationLog.push(`ERROR: Fonts directory does not exist!`);
    }

    // Rounded Mplus 1c（Regular/Bold別ファミリー）を登録
    for (const font of MPLUS_FONTS) {
      const fontPath = path.join(fontsDir, font.file);
      const exists = fs.existsSync(fontPath);
      fontRegistrationLog.push(`${font.family} (${font.weight}): ${exists ? 'OK' : 'NOT FOUND'} (${font.file})`);
      if (exists) {
        registerFont(fontPath, { family: font.family, weight: font.weight });
      }
    }

    // 他のフォントを登録（Boldも別ファミリー名で登録済み）
    for (const font of OTHER_FONTS) {
      const fontPath = path.join(fontsDir, font.file);
      const exists = fs.existsSync(fontPath);
      fontRegistrationLog.push(`${font.family} (${font.weight}): ${exists ? 'OK' : 'NOT FOUND'} (${font.file})`);
      if (exists) {
        registerFont(fontPath, { family: font.family, weight: font.weight });
      }
    }

    fontsRegistered = true;
    fontRegistrationLog.push('Font registration complete');
    console.log('Font registration:', fontRegistrationLog);
  } catch (error) {
    fontRegistrationLog.push(`ERROR: ${error}`);
    console.error('Failed to register fonts:', error);
  }
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || '';

interface Frame {
  x: number;
  y: number;
}

interface FrameSize {
  width: number;
  height: number;
}

interface NameStyle {
  font_size: number;
  font_family: string;
  font_weight?: string; // '100' | '300' | '400' | '500' | '700' | '800' | '900'
  color: string;
  stroke_enabled?: boolean;
  stroke_color: string;
  stroke_width: number;
  offset_y: number;
}

interface CastData {
  id: number;
  name: string;
  photo_path: string | null;
}

// POST: 出勤表画像を生成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, date, castIds } = body as {
      storeId: number;
      date: string;
      castIds: number[];
    };

    if (!storeId || !castIds || castIds.length === 0) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      );
    }

    // テンプレートを取得
    const { data: template, error: templateError } = await supabase
      .from('store_schedule_templates')
      .select('*')
      .eq('store_id', storeId)
      .single();

    if (templateError || !template || !template.image_path) {
      return NextResponse.json(
        { error: 'Template not found or not configured' },
        { status: 404 }
      );
    }

    // キャスト情報を取得（順序を維持）
    const { data: casts, error: castsError } = await supabase
      .from('casts')
      .select('id, name, photo_path')
      .in('id', castIds);

    if (castsError) {
      return NextResponse.json(
        { error: 'Failed to get casts' },
        { status: 500 }
      );
    }

    // castIdsの順序でソート
    const orderedCasts: CastData[] = castIds
      .map(id => casts?.find(c => c.id === id))
      .filter((c): c is CastData => c !== undefined);

    // テンプレート画像を取得
    const templateUrl = `${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${template.image_path}`;
    const templateResponse = await fetch(templateUrl);
    if (!templateResponse.ok) {
      return NextResponse.json(
        { error: 'Failed to fetch template image' },
        { status: 500 }
      );
    }
    const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());

    // プレースホルダー画像を取得（あれば）
    let placeholderBuffer: Buffer | null = null;
    if (template.placeholder_path) {
      const placeholderUrl = `${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${template.placeholder_path}`;
      const placeholderResponse = await fetch(placeholderUrl);
      if (placeholderResponse.ok) {
        placeholderBuffer = Buffer.from(await placeholderResponse.arrayBuffer());
      }
    }

    const frames: Frame[] = template.frames || [];
    const frameSize: FrameSize = template.frame_size || { width: 150, height: 200 };
    // デフォルト値とDBの値をマージ（DBに欠けているフィールドはデフォルト値を使用）
    const defaultNameStyle: NameStyle = {
      font_size: 24,
      font_family: 'Rounded Mplus 1c',
      font_weight: '700',
      color: '#FFFFFF',
      stroke_enabled: true,
      stroke_color: '#000000',
      stroke_width: 2,
      offset_y: 10,
    };
    const nameStyle: NameStyle = {
      ...defaultNameStyle,
      ...template.name_style,
    };

    // 枠数が0の場合はエラー
    if (frames.length === 0) {
      return NextResponse.json(
        { error: 'No frames configured in template' },
        { status: 400 }
      );
    }

    // 必要なページ数を計算
    const totalPages = Math.ceil(orderedCasts.length / frames.length);
    const images: string[] = [];

    // 各ページを生成
    for (let page = 0; page < totalPages; page++) {
      const startIndex = page * frames.length;
      const pageCasts = orderedCasts.slice(startIndex, startIndex + frames.length);

      // 合成用の配列を準備
      const composites: sharp.OverlayOptions[] = [];

      // 各枠にキャスト写真を配置
      for (let i = 0; i < frames.length && i < pageCasts.length; i++) {
        const frame = frames[i];
        const cast = pageCasts[i];

        let photoBuffer: Buffer | null = null;

        // キャスト写真を取得
        if (cast.photo_path) {
          const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${cast.photo_path}`;
          const photoResponse = await fetch(photoUrl);
          if (photoResponse.ok) {
            photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
          }
        }

        // 写真がなければプレースホルダーを使用
        if (!photoBuffer && placeholderBuffer) {
          photoBuffer = placeholderBuffer;
        }

        // 写真があれば配置
        if (photoBuffer) {
          const resizedPhoto = await sharp(photoBuffer)
            .resize(Math.round(frameSize.width), Math.round(frameSize.height), { fit: 'cover' })
            .toBuffer();

          composites.push({
            input: resizedPhoto,
            left: Math.round(frame.x),
            top: Math.round(frame.y),
          });
        }

        // 名前テキストを生成して配置
        const nameBuffer = generateNameText(cast.name, Math.round(frameSize.width), nameStyle);
        if (nameBuffer) {
          composites.push({
            input: nameBuffer,
            left: Math.round(frame.x),
            top: Math.round(frame.y + frameSize.height + nameStyle.offset_y),
          });
        }
      }

      // 画像を合成
      const resultBuffer = await sharp(templateBuffer)
        .composite(composites)
        .png()
        .toBuffer();

      // Base64で追加
      const base64 = resultBuffer.toString('base64');
      images.push(`data:image/png;base64,${base64}`);
    }

    return NextResponse.json({
      success: true,
      images,
      totalPages,
      // 後方互換性のため、1枚目をimageとしても返す
      image: images[0],
    });
  } catch (error) {
    console.error('Generate schedule image error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// 登録済みフォントのマッピング
const REGISTERED_FONTS: Record<string, string> = {
  'Rounded Mplus 1c': 'Rounded Mplus 1c',
  'Kosugi Maru': 'Kosugi Maru',
  'Hachi Maru Pop': 'Hachi Maru Pop',
  'Yusei Magic': 'Yusei Magic',
  'Zen Maru Gothic': 'Zen Maru Gothic',
  'Dela Gothic One': 'Dela Gothic One',
  'Reggae One': 'Reggae One',
  'RocknRoll One': 'RocknRoll One',
};

// ウェイトに応じて実際のフォントファミリー名を返す（Boldは別ファミリー名）
function getActualFontFamily(baseFontFamily: string, weight: string): string {
  const numWeight = parseInt(weight, 10);
  const isBold = !isNaN(numWeight) && numWeight >= 600;

  // Boldウェイトの場合、対応するBoldファミリーがあれば使用
  if (isBold) {
    if (baseFontFamily === 'Zen Maru Gothic') {
      return 'Zen Maru Gothic Bold';
    }
    if (baseFontFamily === 'Rounded Mplus 1c') {
      return 'Rounded Mplus 1c Bold';
    }
  }

  return baseFontFamily;
}


// 名前テキストを画像として生成（node-canvas使用）
function generateNameText(
  name: string,
  width: number,
  style: NameStyle
): Buffer | null {
  try {
    // フォントを登録
    ensureFontsRegistered();

    const fontSize = style.font_size;
    const height = fontSize + 20;
    // 登録済みフォントがあればそれを使用、なければRounded Mplus 1cにフォールバック
    const requestedFont = style.font_family || 'Rounded Mplus 1c';
    const baseFontFamily = REGISTERED_FONTS[requestedFont] || 'Rounded Mplus 1c';
    const fontWeight = style.font_weight || '700'; // デフォルトはBold
    // ウェイトに応じて実際のフォントファミリー名を取得（Boldは別ファミリー名）
    const actualFontFamily = getActualFontFamily(baseFontFamily, fontWeight);
    // stroke_enabledが文字列"false"の場合も考慮（DBから取得時に型が変わる可能性）
    const rawStrokeEnabled = style.stroke_enabled as unknown;
    // falseまたは'false'の場合のみ無効、それ以外（true, undefined等）は有効
    const strokeEnabled = rawStrokeEnabled !== false && rawStrokeEnabled !== 'false';

    // Canvasを作成
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 背景を透明に
    ctx.clearRect(0, 0, width, height);

    // フォント設定（Boldフォントにはboldキーワードも追加）
    const numWeight = parseInt(fontWeight, 10);
    const isBold = !isNaN(numWeight) && numWeight >= 600;
    const fontString = isBold
      ? `bold ${fontSize}px "${actualFontFamily}"`
      : `${fontSize}px "${actualFontFamily}"`;
    ctx.font = fontString;


    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const x = width / 2;
    const y = height / 2;

    // 縁取り（先に描画）
    if (strokeEnabled && style.stroke_width > 0) {
      ctx.strokeStyle = style.stroke_color;
      ctx.lineWidth = style.stroke_width * 2;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;
      ctx.strokeText(name, x, y);
    }

    // 塗りつぶし
    ctx.fillStyle = style.color;
    ctx.fillText(name, x, y);

    return canvas.toBuffer('image/png');
  } catch (error) {
    console.error('Generate name text error:', error);
    return null;
  }
}
