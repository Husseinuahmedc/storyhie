export type Template = 'cinematic' | 'polaroid' | 'cover' | 'vinyl' | 'postcard' | 'wide';
export type Draft = { image?: string; title: string; artist: string; cover?: string; caption: string; template: Template; scale: number; x: number; y: number };
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const templates = {
  cinematic: { label: 'سينمائي', photo: [0, 0, 1080, 1920], art: [792, 1380, 164], dark: true, background: '#211827' },
  polaroid: { label: 'بولارويد', photo: [76, 124, 928, 1192], art: [792, 1400, 164], dark: false, background: '#FFF1E6' },
  cover: { label: 'لون من الغلاف', photo: [80, 140, 920, 1120], art: [792, 1400, 164], dark: false, background: '#D2B8FF' },
  vinyl: { label: 'أسطوانة', photo: [80, 145, 920, 870], art: [390, 1060, 300], dark: true, background: '#171C29' },
  postcard: { label: 'بطاقة بريدية', photo: [104, 510, 872, 1050], art: [782, 242, 176], dark: false, background: '#F4F2E9' },
  wide: { label: 'لقطة عريضة', photo: [0, 585, 1080, 730], art: [110, 1395, 184], dark: true, background: '#26382C' },
} as const;

export function photoSlot(template: Template) {
  const [x, y, w, h] = templates[template].photo;
  return { x, y, w, h };
}

export async function decodeImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight: number, maxLines: number) {
  const value = text.trim();
  if (!value) return;
  ctx.direction = /^[^\p{L}]*\p{Script=Arabic}/u.test(value) ? 'rtl' : 'ltr';
  ctx.textAlign = 'right';
  let lines: string[] = [];
  for (; size >= 24; size -= 2) {
    ctx.font = weight + ' ' + size + 'px "Noto Sans Arabic", Arial';
    lines = [];
    let line = '';
    for (const word of value.split(/\s+/)) {
      const candidate = line ? line + ' ' + word : word;
      if (line && ctx.measureText(candidate).width > width) {
        lines.push(line);
        line = word;
      } else line = candidate;
    }
    if (line) lines.push(line);
    if (lines.length <= maxLines && lines.every(item => ctx.measureText(item).width <= width)) break;
  }
  if (lines.length > maxLines) lines = [lines.join(' ')];
  lines.forEach((item, index) => ctx.fillText(item, x, y + index * (size + 12), width));
}

export async function renderStory(canvas: HTMLCanvasElement, draft: Draft, hideArtwork = false) {
  const [photo, cover] = await Promise.all([
    decodeImage(draft.image ?? '/assets/sample.webp'),
    draft.cover ? decodeImage(draft.cover) : null,
    document.fonts.load('700 56px "Noto Sans Arabic"', 'أغنية'),
    document.fonts.load('400 40px "Noto Sans Arabic"', 'أغنية'),
  ]);
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('تعذّر تجهيز الصورة.');
  const layout = templates[draft.template];
  let background: string = layout.background;
  if (draft.template === 'cover') {
    background = '#D2B8FF';
    if (cover) {
      const swatch = document.createElement('canvas');
      swatch.width = swatch.height = 1;
      const sample = swatch.getContext('2d');
      if (sample) {
        sample.drawImage(cover, 0, 0, 1, 1);
        const channels = sample.getImageData(0, 0, 1, 1).data;
        background = 'rgb(' + Array.from(channels.slice(0, 3), (v) => Math.round(v * .28 + 255 * .72)).join(',') + ')';
      }
    }
  }
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const slot = photoSlot(draft.template);
  const ratio = Math.max(slot.w / photo.naturalWidth, slot.h / photo.naturalHeight) * draft.scale;
  const w = photo.naturalWidth * ratio;
  const h = photo.naturalHeight * ratio;
  const clamp = (offset: number, limit: number) => Math.max(-limit, Math.min(limit, offset));
  const dx = clamp(draft.x * slot.w / 100, Math.max(0, (w - slot.w) / 2));
  const dy = clamp(draft.y * slot.h / 100, Math.max(0, (h - slot.h) / 2));
  ctx.save();
  ctx.beginPath();
  ctx.rect(slot.x, slot.y, slot.w, slot.h);
  ctx.clip();
  ctx.drawImage(photo, slot.x + (slot.w - w) / 2 + dx, slot.y + (slot.h - h) / 2 + dy, w, h);
  ctx.restore();

  const cinematic = draft.template === 'cinematic';
  if (cinematic) {
    const gradient = ctx.createLinearGradient(0, 870, 0, HEIGHT);
    gradient.addColorStop(0, '#21182700');
    gradient.addColorStop(1, '#211827');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 870, WIDTH, HEIGHT - 870);
  }
  const [artX, artY, artSize] = layout.art;
  if (cinematic) {
    ctx.fillStyle = '#211827';
    ctx.beginPath();
    ctx.roundRect(72, artY - 26, 936, 260, 32);
    ctx.fill();
  }
  if (!hideArtwork) {
    ctx.fillStyle = '#D2B8FF';
    ctx.fillRect(artX, artY, artSize, artSize);
    if (cover) {
      const ratio = artSize / Math.max(cover.naturalWidth, cover.naturalHeight);
      const width = cover.naturalWidth * ratio;
      const height = cover.naturalHeight * ratio;
      ctx.drawImage(cover, artX + (artSize - width) / 2, artY + (artSize - height) / 2, width, height);
    } else {
      ctx.fillStyle = '#211827';
      ctx.beginPath();
      ctx.arc(artX + artSize / 2, artY + artSize / 2, artSize * .29, 0, 2 * Math.PI);
      ctx.fill();
      ctx.fillStyle = '#FFABC4';
      ctx.beginPath();
      ctx.arc(artX + artSize / 2, artY + artSize / 2, artSize * .09, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  const vinyl = draft.template === 'vinyl';
  const wide = draft.template === 'wide';
  const x = vinyl || wide ? 972 : artX - 32;
  const width = vinyl ? 864 : wide ? 640 : x - 106;
  const y = vinyl ? 1430 : artY + 48;
  ctx.fillStyle = layout.dark ? '#FFF1E6' : '#211827';
  drawText(ctx, draft.title, x, y, width, 54, 700, 2);
  ctx.fillStyle = layout.dark ? '#DDC8D6' : '#52596A';
  drawText(ctx, draft.artist, x, y + 124, width, 36, 400, 2);
  ctx.fillStyle = layout.dark ? '#FFF1E6' : '#211827';
  drawText(ctx, draft.caption, 980, 1715, 880, 46, 700, 2);
}
