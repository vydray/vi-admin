import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import sharp from 'sharp';

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
      const nameBuffer = await generateNameText(cast.name, frameSize.width, nameStyle);
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

// Google Fontsの@font-face定義
const GOOGLE_FONTS_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Dela+Gothic+One&family=Hachi+Maru+Pop&family=Kosugi+Maru&family=M+PLUS+Rounded+1c:wght@700&family=Reggae+One&family=RocknRoll+One&family=Yusei+Magic&family=Zen+Maru+Gothic:wght@700&display=swap');
`;

// 名前テキストを画像として生成
async function generateNameText(
  name: string,
  width: number,
  style: NameStyle
): Promise<Buffer | null> {
  try {
    const height = style.font_size + 20;
    const fontSize = style.font_size;
    const fontFamily = style.font_family || 'Hiragino Kaku Gothic ProN';
    const strokeEnabled = style.stroke_enabled !== false;

    // SVGでテキストを生成
    const svg = `
      <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <style>
            ${GOOGLE_FONTS_CSS}
            .name {
              font-family: '${fontFamily}', 'Hiragino Kaku Gothic ProN', 'メイリオ', sans-serif;
              font-size: ${fontSize}px;
              font-weight: bold;
            }
          </style>
        </defs>
        <text
          x="${width / 2}"
          y="${fontSize + 5}"
          text-anchor="middle"
          class="name"
          ${strokeEnabled ? `stroke="${style.stroke_color}" stroke-width="${style.stroke_width}"` : ''}
          fill="${style.color}"
        >${escapeXml(name)}</text>
      </svg>
    `;

    const buffer = await sharp(Buffer.from(svg))
      .png()
      .toBuffer();

    return buffer;
  } catch (error) {
    console.error('Generate name text error:', error);
    return null;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
