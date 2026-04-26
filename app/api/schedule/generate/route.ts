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

// HEX色をRGBオブジェクトに変換
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    };
  }
  // デフォルトは白
  return { r: 255, g: 255, b: 255 };
}

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

interface PhotoCrop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface GridSettings {
  columns: number;
  rows: number;
  photo_width: number;
  photo_height: number;
  gap: number;
  background_color: string;
  show_names: boolean;
}

interface CastData {
  id: number;
  name: string;
  photo_path: string | null;
  photo_crop: PhotoCrop | null;
}

// POST: 出勤表画像を生成
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { storeId, date: _date, castIds } = body as {
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

    if (templateError || !template) {
      return NextResponse.json(
        { error: 'Template not found or not configured' },
        { status: 404 }
      );
    }

    // モードを判定（デフォルトはcustom）
    const mode = template.mode || 'custom';

    // customモードでは背景画像が必須
    if (mode === 'custom' && !template.image_path) {
      return NextResponse.json(
        { error: 'Template image not configured for custom mode' },
        { status: 404 }
      );
    }

    // キャスト情報を取得（順序を維持）
    const { data: casts, error: castsError } = await supabase
      .from('casts')
      .select('id, name, photo_path, photo_crop')
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

    // プレースホルダー画像を取得（あれば）
    let placeholderBuffer: Buffer | null = null;
    if (template.placeholder_path) {
      const placeholderUrl = `${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${template.placeholder_path}`;
      const placeholderResponse = await fetch(placeholderUrl);
      if (placeholderResponse.ok) {
        placeholderBuffer = Buffer.from(await placeholderResponse.arrayBuffer());
      }
    }

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

    // ストリーム経由でページごとに送出（クライアント側で進捗％を表示）
    // 形式: NDJSON
    //   {"type":"meta","totalPages":N,"mode":"grid"|"custom"}
    //   {"type":"page","index":0,"image":"data:image/png;base64,..."}
    //   ...
    //   {"type":"done"}
    //   エラー時: {"type":"error","message":"..."}
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (obj: unknown) => {
          controller.enqueue(encoder.encode(JSON.stringify(obj) + '\n'));
        };

        try {
          if (mode === 'grid') {
            // グリッドモード
            const defaultGridSettings: GridSettings = {
              columns: 4,
              rows: 2,
              photo_width: 300,
              photo_height: 400,
              gap: 10,
              background_color: '#ffffff',
              show_names: false,
            };
            const gridSettings: GridSettings = {
              ...defaultGridSettings,
              ...template.grid_settings,
            };

            // 最初の写真からサイズを取得して自動計算
            let photoWidth = 300;
            let photoHeight = 400;

            // Vercelレスポンス上限(4.5MB)対策: 1辺の上限を設定。
            // 元のアスペクト比は維持し、超えた場合のみ等比縮小する。
            const MAX_PHOTO_DIMENSION = 1000;
            const capDimensions = (w: number, h: number): [number, number] => {
              const maxDim = Math.max(w, h);
              if (maxDim <= MAX_PHOTO_DIMENSION) return [w, h];
              const scale = MAX_PHOTO_DIMENSION / maxDim;
              return [Math.round(w * scale), Math.round(h * scale)];
            };

            // 写真がある最初のキャストを探してサイズを取得
            for (const cast of orderedCasts) {
              if (cast.photo_path) {
                const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${cast.photo_path}`;
                const photoResponse = await fetch(photoUrl);
                if (photoResponse.ok) {
                  const photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                  const metadata = await sharp(photoBuffer).metadata();
                  if (metadata.width && metadata.height) {
                    [photoWidth, photoHeight] = capDimensions(metadata.width, metadata.height);
                    break;
                  }
                }
              }
            }

            // プレースホルダーがある場合はそのサイズも考慮
            if (photoWidth === 300 && photoHeight === 400 && placeholderBuffer) {
              const metadata = await sharp(placeholderBuffer).metadata();
              if (metadata.width && metadata.height) {
                [photoWidth, photoHeight] = capDimensions(metadata.width, metadata.height);
              }
            }

            const castsPerPage = gridSettings.columns * gridSettings.rows;
            const totalPages = Math.ceil(orderedCasts.length / castsPerPage);

            // 名前表示時の追加高さ
            const nameHeight = gridSettings.show_names ? nameStyle.font_size + 20 + nameStyle.offset_y : 0;

            // キャンバスサイズを計算
            const canvasWidth = gridSettings.columns * photoWidth + (gridSettings.columns + 1) * gridSettings.gap;
            const canvasHeight = gridSettings.rows * (photoHeight + nameHeight) + (gridSettings.rows + 1) * gridSettings.gap;

            send({ type: 'meta', totalPages, mode });

            // 各ページを生成
            for (let page = 0; page < totalPages; page++) {
              const startIndex = page * castsPerPage;
              const pageCasts = orderedCasts.slice(startIndex, startIndex + castsPerPage);

              const composites: sharp.OverlayOptions[] = [];

              for (let i = 0; i < castsPerPage; i++) {
                const cast = pageCasts[i];
                const col = i % gridSettings.columns;
                const row = Math.floor(i / gridSettings.columns);

                const x = gridSettings.gap + col * (photoWidth + gridSettings.gap);
                const y = gridSettings.gap + row * (photoHeight + nameHeight + gridSettings.gap);

                let photoBuffer: Buffer | null = null;

                if (cast && cast.photo_path) {
                  const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${cast.photo_path}`;
                  const photoResponse = await fetch(photoUrl);
                  if (photoResponse.ok) {
                    photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                  }
                }

                if (!photoBuffer && placeholderBuffer) {
                  photoBuffer = placeholderBuffer;
                }

                if (photoBuffer) {
                  const processedPhoto = await sharp(photoBuffer)
                    .resize(photoWidth, photoHeight, { fit: 'cover' })
                    .toBuffer();

                  composites.push({
                    input: processedPhoto,
                    left: x,
                    top: y,
                  });
                }

                if (gridSettings.show_names && cast) {
                  const nameBuffer = generateNameText(cast.name, photoWidth, nameStyle);
                  if (nameBuffer) {
                    composites.push({
                      input: nameBuffer,
                      left: x,
                      top: y + photoHeight + nameStyle.offset_y,
                    });
                  }
                }
              }

              const resultBuffer = await sharp({
                create: {
                  width: canvasWidth,
                  height: canvasHeight,
                  channels: 3,
                  background: hexToRgb(gridSettings.background_color),
                },
              })
                .composite(composites)
                .png()
                .toBuffer();

              const base64 = resultBuffer.toString('base64');
              send({ type: 'page', index: page, image: `data:image/png;base64,${base64}` });
            }
          } else {
            // カスタムモード
            const templateUrl = `${SUPABASE_URL}/storage/v1/object/public/schedule-templates/${template.image_path}`;
            const templateResponse = await fetch(templateUrl);
            if (!templateResponse.ok) {
              send({ type: 'error', message: 'Failed to fetch template image' });
              controller.close();
              return;
            }
            const templateBuffer = Buffer.from(await templateResponse.arrayBuffer());

            const frames: Frame[] = template.frames || [];
            const frameSize: FrameSize = template.frame_size || { width: 150, height: 200 };

            if (frames.length === 0) {
              send({ type: 'error', message: 'No frames configured in template' });
              controller.close();
              return;
            }

            const totalPages = Math.ceil(orderedCasts.length / frames.length);

            send({ type: 'meta', totalPages, mode });

            for (let page = 0; page < totalPages; page++) {
              const startIndex = page * frames.length;
              const pageCasts = orderedCasts.slice(startIndex, startIndex + frames.length);

              const composites: sharp.OverlayOptions[] = [];

              for (let i = 0; i < frames.length && i < pageCasts.length; i++) {
                const frame = frames[i];
                const cast = pageCasts[i];

                let photoBuffer: Buffer | null = null;

                if (cast.photo_path) {
                  const photoUrl = `${SUPABASE_URL}/storage/v1/object/public/cast-photos/${cast.photo_path}`;
                  const photoResponse = await fetch(photoUrl);
                  if (photoResponse.ok) {
                    photoBuffer = Buffer.from(await photoResponse.arrayBuffer());
                  }
                }

                if (!photoBuffer && placeholderBuffer) {
                  photoBuffer = placeholderBuffer;
                }

                if (photoBuffer) {
                  let processedPhoto: Buffer;
                  if (cast.photo_crop) {
                    processedPhoto = await sharp(photoBuffer)
                      .extract({
                        left: Math.round(cast.photo_crop.x),
                        top: Math.round(cast.photo_crop.y),
                        width: Math.round(cast.photo_crop.width),
                        height: Math.round(cast.photo_crop.height),
                      })
                      .resize(Math.round(frameSize.width), Math.round(frameSize.height), { fit: 'cover' })
                      .toBuffer();
                  } else {
                    processedPhoto = await sharp(photoBuffer)
                      .resize(Math.round(frameSize.width), Math.round(frameSize.height), { fit: 'cover' })
                      .toBuffer();
                  }

                  composites.push({
                    input: processedPhoto,
                    left: Math.round(frame.x),
                    top: Math.round(frame.y),
                  });
                }

                const nameBuffer = generateNameText(cast.name, Math.round(frameSize.width), nameStyle);
                if (nameBuffer) {
                  composites.push({
                    input: nameBuffer,
                    left: Math.round(frame.x),
                    top: Math.round(frame.y + frameSize.height + nameStyle.offset_y),
                  });
                }
              }

              const resultBuffer = await sharp(templateBuffer)
                .composite(composites)
                .png()
                .toBuffer();

              const base64 = resultBuffer.toString('base64');
              send({ type: 'page', index: page, image: `data:image/png;base64,${base64}` });
            }
          }

          send({ type: 'done' });
        } catch (error) {
          console.error('Generate schedule image error:', error);
          send({ type: 'error', message: 'Internal server error' });
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson',
        'X-Accel-Buffering': 'no',
        'Cache-Control': 'no-cache, no-transform',
      },
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
