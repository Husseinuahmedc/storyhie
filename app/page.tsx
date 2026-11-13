'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { decodeImage, photoSlot, renderStory } from './story';
import type { Draft, Template } from './story';
import { canonicalTrack } from './spotify';

type Step = 'start' | 'track' | 'editor' | 'ready';
type SpotifyPreview = { title: string; artist: string; thumbnail: string | null; url: string };
const initial: Draft = { title: '', artist: '', caption: '', template: 'cinematic', scale: 1, x: 0, y: 0 };
const sample: Draft = { ...initial, title: 'ليل ومطر', artist: 'نور الربيع · مثال' };
const templates: [Template, string][] = [['cinematic', 'سينمائي'], ['polaroid', 'بولارويد'], ['cover', 'لون من الغلاف']];

function Story({ draft }: { draft: Draft }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const buffer = document.createElement('canvas');
    renderStory(buffer, draft).then(() => {
      if (!active) return;
      const canvas = ref.current;
      canvas?.getContext('2d')?.drawImage(buffer, 0, 0);
      setFailed(false);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [draft]);
  return <>{failed && <p role="status">تعذّر عرض المعاينة.</p>}<canvas ref={ref} className="story-canvas" width={1080} height={1920} role="img" aria-label="معاينة الستوري" /></>;
}

function FilePicker({ onImage, label, disabled = false }: { onImage: (file: File) => void; label: string; disabled?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  return <>
    <input ref={ref} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => {
      const file = event.currentTarget.files?.[0];
      if (file) onImage(file);
      event.currentTarget.value = '';
    }} />
    <button className="primary-btn" disabled={disabled} onClick={() => ref.current?.click()}>{label}</button>
  </>;
}

async function readLocalPhoto(file: File) {
  if (file.size > 25 * 1024 * 1024) throw new Error('اختار صورة أصغر من ٢٥ ميغابايت.');
  const url = URL.createObjectURL(file);
  try {
    let image: HTMLImageElement;
    try { image = await decodeImage(url); }
    catch { throw new Error('الصورة ما انفتحت. جرّب JPG أو PNG أو WebP.'); }
    const ratio = Math.min(1, 2160 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('تعذّر تجهيز الصورة.');
    ctx.fillStyle = '#FFF1E6';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', .92);
  } finally { URL.revokeObjectURL(url); }
}

export default function Home() {
  const [step, setStep] = useState<Step>('start');
  const [draft, setDraft] = useState(initial);
  const [trackUrl, setTrackUrl] = useState('');
  const [preview, setPreview] = useState<SpotifyPreview | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const drag = useRef<{ id: number; x: number; y: number } | null>(null);
  const request = useRef<AbortController | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    if (step !== 'start') heading.current?.focus();
    window.scrollTo(0, 0);
  }, [step]);
  useEffect(() => () => request.current?.abort(), []);

  function go(next: Step) {
    setError('');
    setNotice('');
    setStep(next);
  }

  async function pick(file: File, kind: 'image' | 'cover', advance = false) {
    setBusy(true);
    setError('');
    try {
      const data = await readLocalPhoto(file);
      setDraft((current) => kind === 'image'
        ? { ...current, image: data, scale: 1, x: 0, y: 0 }
        : { ...current, cover: data });
      if (advance) go('track');
    } catch (cause) { setError((cause as Error).message); }
    finally { setBusy(false); }
  }

  function updateUrl(value: string) {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setTrackUrl(value);
    setPreview(null);
    setError('');
  }

  async function previewSpotify() {
    const url = canonicalTrack(trackUrl);
    if (!url) { setError('الصق رابط أغنية مباشر من Spotify. تگدر تكمل بالإدخال اليدوي.'); return; }
    const controller = new AbortController();
    request.current?.abort();
    request.current = controller;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/track-preview', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url }),
        signal: controller.signal,
      });
      const data = await response.json();
      if (controller.signal.aborted) return;
      if (!response.ok) { setError(data.error || 'تعذّرت المعاينة. جرّب الإدخال اليدوي.'); return; }
      setPreview(data);
    } catch {
      if (!controller.signal.aborted) setError('تعذّرت المعاينة. جرّب الإدخال اليدوي.');
    } finally {
      if (request.current === controller) setLoading(false);
    }
  }

  function pointerMove(event: PointerEvent<HTMLDivElement>) {
    const last = drag.current;
    if (!last || last.id !== event.pointerId) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const slot = photoSlot(draft.template);
    const dx = (event.clientX - last.x) * 1080 / (rect.width * slot.w) * 100;
    const dy = (event.clientY - last.y) * 1920 / (rect.height * slot.h) * 100;
    drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    const clamp = (value: number) => Math.max(-50, Math.min(50, value));
    setDraft((current) => ({ ...current, x: clamp(current.x + dx), y: clamp(current.y + dy) }));
  }

  async function exportPng() {
    setBusy(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      await renderStory(canvas, draft);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error();
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'storyhie.png';
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 30000);
    } catch { setError('تعذّر تنزيل الستوري. جرّب مرّة ثانية.'); }
    finally { setBusy(false); }
  }

  const canonical = canonicalTrack(trackUrl);
  return <main className="app-shell"><div className="phone-frame">
    <div className="brand-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/assets/mark.svg" alt="" width={35} height={35} />
      <span>أغنية لهاللقطة</span>
    </div>
    <div className="page-content">
      {step === 'start' && <>
        <section className="hero"><h1>أغنية<br />لهاللقطة</h1><p>اختار صورتك وأغنية تشبهها، وسوّي ستوري بطريقتك.</p></section>
        <div className="sample-wrap"><Story draft={sample} /></div>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="bottom-action"><FilePicker onImage={(file) => void pick(file, 'image', true)} label={busy ? 'جارٍ تجهيز الصورة…' : 'اختار صورة'} disabled={busy} /></div>
      </>}
      {step === 'track' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">اختار أغنية</h1>
        <p className="section-copy">الصق رابط الأغنية من Spotify أو اكتب معلوماتها بنفسك.</p>
        <label className="field"><span>رابط Spotify (اختياري)</span><input className="input url-field" dir="ltr" inputMode="url" maxLength={500} value={trackUrl} onChange={(event) => updateUrl(event.target.value)} placeholder="open.spotify.com/track/…" /></label>
        <button className="primary-btn full" disabled={loading} onClick={() => void previewSpotify()}>{loading ? 'جارٍ التحميل…' : 'اعرض الأغنية'}</button>
        {error && <p className="status error" role="alert">{error}</p>}
        {preview && <div className="notice">
          <a className="track-row" href={preview.url} target="_blank" rel="noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {preview.thumbnail && <img className="provider-art" src={preview.thumbnail} width={52} height={52} alt="" />}
            <span><b dir="auto">{preview.title || 'الأغنية'}</b>{preview.artist && <small dir="auto">{preview.artist}</small>}<small>افتح على Spotify</small></span>
          </a>
          <p>{preview.thumbnail ? 'الغلاف يظهر هنا للمعاينة.' : 'الغلاف غير متوفر للمعاينة.'} اكتب التفاصيل اللي تريدها بالستوري أدناه.</p>
        </div>}
        <label className="field"><span>اسم الأغنية</span><input className="input" dir="auto" maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
        <label className="field"><span>الفنان</span><input className="input" dir="auto" maxLength={80} value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} /></label>
        <div className="cover-upload"><FilePicker label={draft.cover ? 'بدّل غلافك' : 'أضف غلافك'} disabled={busy} onImage={(file) => void pick(file, 'cover')} /><span>اختياري، استخدم صورة عندك حق استخدامها</span></div>
        {draft.cover && <button className="mini-btn" onClick={() => setDraft({ ...draft, cover: undefined })}>إزالة الغلاف</button>}
        <div className="form-actions">
          <button className="primary-btn" disabled={busy} onClick={() => {
            if (!draft.title.trim() || !draft.artist.trim()) { setError('اكتب اسم الأغنية والفنان حتى نكمل.'); return; }
            go('editor');
          }}>اختار القالب</button>
          <button className="secondary-btn" onClick={() => go('start')}>رجوع</button>
        </div>
      </section>}
      {step === 'editor' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">عدّل الستوري</h1>
        <div className="preview-card" onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <Story draft={draft} />
        </div>
        <h2 className="template-label">القوالب</h2>
        <div className="template-switcher">{templates.map(([id, label]) => <button key={id} className={draft.template === id ? 'template-btn active' : 'template-btn'} aria-pressed={draft.template === id} onClick={() => setDraft({ ...draft, template: id })}>{label}</button>)}</div>
        <label className="field"><span>جملة قصيرة (اختياري)</span><textarea className="textarea" dir="auto" rows={2} maxLength={80} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} placeholder="اكتب جملة قصيرة…" /></label>
        <label className="control-row"><span>حجم الصورة</span><input className="range" type="range" min="1" max="2.5" step=".01" value={draft.scale} onChange={(event) => setDraft({ ...draft, scale: Number(event.target.value) })} /></label>
        <div className="zoom-buttons"><button className="mini-btn" onClick={() => setDraft({ ...draft, scale: 1, x: 0, y: 0 })}>إرجاع الصورة</button><FilePicker label="بدّل الصورة" disabled={busy} onImage={(file) => void pick(file, 'image')} /></div>
        <p className="editor-hint">حرّك الصورة بإصبعك أو بالماوس داخل القالب.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions"><button className="primary-btn" disabled={busy} onClick={() => go('ready')}>جهّز الستوري</button><button className="secondary-btn" onClick={() => go('track')}>رجوع للأغنية</button></div>
      </section>}
      {step === 'ready' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">ستوريك جاهز</h1>
        <div className="ready-preview"><Story draft={draft} /></div>
        <div className="dimensions">PNG · 1080 × 1920</div>
        <p className="ready-copy">بعد الرفع، أضف الأغنية من Music أو رابطها من ملصق Link داخل الإنستا.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="primary-btn" disabled={busy} onClick={() => void exportPng()}>{busy ? 'جارٍ تجهيز الملف…' : 'نزّل PNG'}</button>
          <button className="secondary-btn" onClick={() => go('editor')}>رجوع للتعديل</button>
          <button className="secondary-btn" disabled={busy} onClick={() => { setDraft(initial); updateUrl(''); go('start'); }}>ستوري جديد</button>
        </div>
        {canonical && <div className="notice"><p className="track-link">{canonical}</p><div className="link-row">
          <button className="secondary-btn" onClick={async () => {
            try { await navigator.clipboard.writeText(canonical); setNotice('اننسخ الرابط.'); }
            catch { setNotice('انسخ الرابط يدويًا من النص أعلاه.'); }
          }}>انسخ الرابط</button><a className="secondary-btn" href={canonical} target="_blank" rel="noreferrer">افتح Spotify</a>
        </div><p role="status">{notice}</p></div>}
      </section>}
    </div>
  </div></main>;
}
