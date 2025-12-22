import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';
import { createCanvas, registerFont } from 'canvas';
import path from 'path';

// M PLUS Rounded 1c のウェイト定義
const MPLUS_WEIGHTS = [
  { file: 'MPLUSRounded1c-Thin.ttf', weight: '100' },
  { file: 'MPLUSRounded1c-Light.ttf', weight: '300' },
  { file: 'MPLUSRounded1c-Regular.ttf', weight: '400' },
  { file: 'MPLUSRounded1c-Medium.ttf', weight: '500' },
  { file: 'MPLUSRounded1c-Bold.ttf', weight: '700' },
  { file: 'MPLUSRounded1c-ExtraBold.ttf', weight: '800' },
  { file: 'MPLUSRounded1c-Black.ttf', weight: '900' },
];

// 他のフォント（ウェイト1種類のみ）
const OTHER_FONTS = [
  { file: 'KosugiMaru-Regular.ttf', family: 'Kosugi Maru', weight: '400' },
  { file: 'HachiMaruPop-Regular.ttf', family: 'Hachi Maru Pop', weight: '400' },
  { file: 'YuseiMagic-Regular.ttf', family: 'Yusei Magic', weight: '400' },
  { file: 'ZenMaruGothic-Regular.ttf', family: 'Zen Maru Gothic', weight: '400' },
  { file: 'ZenMaruGothic-Bold.ttf', family: 'Zen Maru Gothic', weight: '700' },
  { file: 'DelaGothicOne-Regular.ttf', family: 'Dela Gothic One', weight: '400' },
  { file: 'ReggaeOne-Regular.ttf', family: 'Reggae One', weight: '400' },
  { file: 'RocknRollOne-Regular.ttf', family: 'RocknRoll One', weight: '400' },
];

// フォントを登録（サーバー起動時に1回だけ実行される）
let fontsRegistered = false;
function ensureFontsRegistered() {
  if (fontsRegistered) return;
  try {
    const fontsDir = path.join(process.cwd(), 'public', 'fonts');

    // M PLUS Rounded 1c の全ウェイトを登録
    for (const font of MPLUS_WEIGHTS) {
      registerFont(path.join(fontsDir, font.file), {
        family: 'M PLUS Rounded 1c',
        weight: font.weight,
      });
    }

    // 他のフォントを登録
    for (const font of OTHER_FONTS) {
      registerFont(path.join(fontsDir, font.file), {
        family: font.family,
        weight: font.weight,
      });
    }

    fontsRegistered = true;
    console.log('All fonts registered successfully');
  } catch (error) {
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
    const nameStyle: NameStyle = template.name_style || {
      font_size: 24,
      font_family: 'Hiragino Kaku Gothic ProN',
      color: '#FFFFFF',
      stroke_enabled: true,
      stroke_color: '#000000',
      stroke_width: 2,
      offset_y: 10,
    };

    // 合成用の配列を準備
    const composites: sharp.OverlayOptions[] = [];

    // 各枠にキャスト写真を配置
    for (let i = 0; i < frames.length && i < orderedCasts.length; i++) {
      const frame = frames[i];
      const cast = orderedCasts[i];

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
          .resize(frameSize.width, frameSize.height, { fit: 'cover' })
          .toBuffer();

        composites.push({
          input: resizedPhoto,
          left: frame.x,
          top: frame.y,
        });
      }

      // 名前テキストを生成して配置
      const nameBuffer = generateNameText(cast.name, frameSize.width, nameStyle);
      if (nameBuffer) {
        composites.push({
          input: nameBuffer,
          left: frame.x,
          top: frame.y + frameSize.height + nameStyle.offset_y,
        });
      }
    }

    // 画像を合成
    const resultBuffer = await sharp(templateBuffer)
      .composite(composites)
      .png()
      .toBuffer();

    // Base64で返す
    const base64 = resultBuffer.toString('base64');

    return NextResponse.json({
      success: true,
      image: `data:image/png;base64,${base64}`,
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
  'M PLUS Rounded 1c': 'M PLUS Rounded 1c',
  'Kosugi Maru': 'Kosugi Maru',
  'Hachi Maru Pop': 'Hachi Maru Pop',
  'Yusei Magic': 'Yusei Magic',
  'Zen Maru Gothic': 'Zen Maru Gothic',
  'Dela Gothic One': 'Dela Gothic One',
  'Reggae One': 'Reggae One',
  'RocknRoll One': 'RocknRoll One',
};

// 名前テキストを画像として生成（node-canvas使用）
function generateNameText(
  name: string,
  width: number,
  style: NameStyle
): Buffer | null {
  try {
    // フォントを登録
    ensureFontsRegistered();

    const height = style.font_size + 20;
    const fontSize = style.font_size;
    // 登録済みフォントがあればそれを使用、なければM PLUS Rounded 1cにフォールバック
    const requestedFont = style.font_family || 'M PLUS Rounded 1c';
    const fontFamily = REGISTERED_FONTS[requestedFont] || 'M PLUS Rounded 1c';
    const fontWeight = style.font_weight || '700'; // デフォルトはBold
    const strokeEnabled = style.stroke_enabled !== false;

    console.log(`Generating text "${name}" with font: ${fontFamily}, weight: ${fontWeight}`);

    // Canvasを作成
    const canvas = createCanvas(width, height);
    const ctx = canvas.getContext('2d');

    // 背景を透明に
    ctx.clearRect(0, 0, width, height);

    // フォント設定（ウェイトを数値で指定）
    ctx.font = `${fontWeight} ${fontSize}px "${fontFamily}"`;
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
