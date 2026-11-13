export type Template = 'cinematic' | 'polaroid' | 'cover';
export type Draft = { image?: string; title: string; artist: string; cover?: string; caption: string; template: Template; scale: number; x: number; y: number };
export const WIDTH = 1080;
export const HEIGHT = 1920;

export function photoSlot(template: Template) {
  if (template === 'polaroid') return { x: 76, y: 124, w: 928, h: 1192 };
  if (template === 'cover') return { x: 80, y: 140, w: 920, h: 1120 };
  return { x: 0, y: 0, w: WIDTH, h: HEIGHT };
}

export async function decodeImage(src: string) {
  const image = new Image();
  image.src = src;
  await image.decode();
  return image;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, max: number) {
  if (ctx.measureText(text).width <= max) return text;
  const chars = Array.from(text);
  while (chars.length && ctx.measureText(chars.join('') + '…').width > max) chars.pop();
  return chars.join('') + '…';
}

export async function renderStory(canvas: HTMLCanvasElement, draft: Draft) {
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
  const paper = draft.template === 'polaroid';
  let background = paper ? '#FFF1E6' : '#211827';
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
  const cardY = cinematic ? 1380 : 1400;
  ctx.fillStyle = cinematic ? '#211827' : background;
  ctx.beginPath();
  ctx.roundRect(80, cardY, 920, 220, 32);
  ctx.fill();
  const artX = 792;
  const artY = cardY + 28;
  const artSize = 164;
  ctx.fillStyle = '#D2B8FF';
  ctx.fillRect(artX, artY, artSize, artSize);
  if (cover) {
    const size = Math.min(cover.naturalWidth, cover.naturalHeight);
    ctx.drawImage(cover, (cover.naturalWidth - size) / 2, (cover.naturalHeight - size) / 2, size, size, artX, artY, artSize, artSize);
  } else {
    ctx.fillStyle = '#211827';
    ctx.beginPath();
    ctx.arc(874, artY + 82, 48, 0, 2 * Math.PI);
    ctx.fill();
    ctx.fillStyle = '#FFABC4';
    ctx.beginPath();
    ctx.arc(874, artY + 82, 15, 0, 2 * Math.PI);
    ctx.fill();
  }
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  ctx.fillStyle = cinematic ? '#FFF1E6' : '#211827';
  ctx.font = '700 60px "Noto Sans Arabic", Arial';
  ctx.fillText(fitText(ctx, draft.title, 630), 758, cardY + 95);
  ctx.font = '400 40px "Noto Sans Arabic", Arial';
  ctx.fillStyle = cinematic ? '#DDC8D6' : '#634A65';
  ctx.fillText(fitText(ctx, draft.artist, 630), 758, cardY + 158);

  ctx.fillStyle = cinematic ? '#FFF1E6' : '#211827';
  ctx.font = '700 48px "Noto Sans Arabic", Arial';
  const lines: string[] = [];
  let line = '';
  for (const word of draft.caption.trim().split(/\s+/)) {
    const candidate = line ? line + ' ' + word : word;
    if (line && ctx.measureText(candidate).width > 900) {
      lines.push(line);
      line = word;
    } else line = candidate;
  }
  if (line) lines.push(line);
  lines.slice(0, 2).forEach((text, i) => ctx.fillText(fitText(ctx, i === 1 && lines.length > 2 ? text + '…' : text, 900), 980, 1700 + 64 * i));
}
