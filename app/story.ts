import { palettes, writingFonts } from './styles';

export type Template = keyof typeof templates;
export type Draft = { image?: string; title: string; artist: string; cover?: string; caption: string; template: Template; font?: keyof typeof writingFonts; palette?: keyof typeof palettes; scale: number; x: number; y: number };
export const WIDTH = 1080;
export const HEIGHT = 1920;

export const templates = {
  editorial: { label: 'Editorial', photo: [72, 540, 936, 1030], art: [818, 233, 190], dark: false, background: '#EDE3D3' },
  ticket: { label: 'Ticket stub', photo: [86, 170, 908, 990], art: [134, 1290, 182], dark: true, background: '#25372F' },
  sleeve: { label: 'Record sleeve', photo: [96, 242, 888, 888], art: [400, 1180, 280], dark: true, background: '#27232F' },
  cinematic: { label: 'Cinematic', photo: [0, 0, 1080, 1920], art: [792, 1380, 164], dark: true, background: '#211827' },
  polaroid: { label: 'Polaroid', photo: [76, 124, 928, 1192], art: [792, 1400, 164], dark: false, background: '#FFF1E6' },
  cover: { label: 'Cover tone', photo: [80, 140, 920, 1120], art: [792, 1400, 164], dark: false, background: '#D2B8FF' },
  vinyl: { label: 'Vinyl', photo: [80, 145, 920, 870], art: [390, 1060, 300], dark: true, background: '#171C29' },
  postcard: { label: 'Postcard', photo: [104, 510, 872, 1050], art: [782, 242, 176], dark: false, background: '#F4F2E9' },
  wide: { label: 'Widescreen', photo: [0, 585, 1080, 730], art: [110, 1395, 184], dark: true, background: '#26382C' },
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

function drawText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, width: number, size: number, weight: number, maxLines: number, family: string, align: CanvasTextAlign = 'right') {
  const value = text.trim();
  if (!value) return;
  ctx.direction = /^[^\p{L}]*\p{Script=Arabic}/u.test(value) ? 'rtl' : 'ltr';
  ctx.textAlign = align;
  let lines: string[] = [];
  for (; size >= 24; size -= 2) {
    ctx.font = weight + ' ' + size + 'px ' + family;
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
  const mood = draft.font?.split('-')[1] as 'formal' | 'hand' | 'vintage' | undefined;
  const fontFor = (text: string) => {
    const language = /^[^\p{L}]*\p{Script=Arabic}/u.test(text) ? 'ar' : 'en';
    const font = writingFonts[`${language}-${mood ?? 'formal'}`];
    return '"' + font.family + '", "Noto Sans Arabic", Arial';
  };
  const titleFont = fontFor(draft.title);
  const artistFont = fontFor(draft.artist);
  const captionFont = fontFor(draft.caption);
  const [photo, cover] = await Promise.all([
    decodeImage(draft.image ?? '/assets/sample.webp'),
    draft.cover ? decodeImage(draft.cover) : null,
    document.fonts.load('700 56px ' + titleFont, draft.title),
    document.fonts.load('400 40px ' + artistFont, draft.artist),
    document.fonts.load('700 46px ' + captionFont, draft.caption),
  ]);
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not prepare the image.');
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
  const palette = draft.palette ? palettes[draft.palette] : undefined;
  if (palette) background = palette.background;
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
    gradient.addColorStop(0, background + '00');
    gradient.addColorStop(1, background);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 870, WIDTH, HEIGHT - 870);
  }
  const [artX, artY, artSize] = layout.art;
  const ink = palette?.ink ?? (layout.dark ? '#FFF1E6' : '#211827');
  const muted = palette?.muted ?? (layout.dark ? '#DDC8D6' : '#52596A');
  const editorial = draft.template === 'editorial';
  const ticket = draft.template === 'ticket';
  const sleeve = draft.template === 'sleeve';

  if (editorial || ticket || sleeve) {
    ctx.save();
    ctx.strokeStyle = muted;
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (ticket) {
      ctx.roundRect(86, 1206, 908, 389, 26);
      ctx.moveTo(86, 1524);
      ctx.lineTo(994, 1524);
      ctx.setLineDash([14, 12]);
    } else if (editorial) {
      ctx.moveTo(72, 186);
      ctx.lineTo(1008, 186);
      ctx.moveTo(72, 479);
      ctx.lineTo(1008, 479);
    } else {
      ctx.rect(77, 223, 926, 926);
    }
    ctx.stroke();
    ctx.restore();
  }
  if (cinematic) {
    ctx.fillStyle = background;
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
  const x = sleeve ? 540 : editorial ? 72 : ticket ? 358 : vinyl || wide ? 972 : artX - 32;
  const width = sleeve || vinyl ? 864 : editorial ? 710 : ticket ? 584 : wide ? 640 : x - 106;
  const y = sleeve ? 1535 : ticket ? 1354 : vinyl ? 1430 : artY + 48;
  const align = sleeve ? 'center' : editorial || ticket ? 'left' : 'right';
  const titleSize = editorial ? 68 : 54;
  const artistOffset = editorial ? 154 : 124;
  ctx.fillStyle = ink;
  drawText(ctx, draft.title, x, y, width, titleSize, 700, 2, titleFont, align);
  ctx.fillStyle = muted;
  drawText(ctx, draft.artist, x, y + artistOffset, width, 36, 400, ticket || sleeve ? 1 : 2, artistFont, align);
  ctx.fillStyle = ink;
  drawText(ctx, draft.caption, sleeve ? 540 : editorial ? 72 : 980, sleeve ? 1740 : 1715, 880, 46, 700, 2, captionFont, sleeve ? 'center' : editorial ? 'left' : 'right');
}
