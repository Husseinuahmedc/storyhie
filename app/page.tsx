'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { decodeImage, photoSlot, renderStory, templates, WIDTH, HEIGHT } from './story';
import type { Draft, Template } from './story';
import { canonicalTrack } from './spotify';

type Step = 'start' | 'track' | 'editor' | 'ready';
type SpotifyPreview = { title: string; artist: string; thumbnail: string | null; url: string };
type CatalogTrack = SpotifyPreview & { id: number };
const steps: Record<Step, string> = { start: 'الصورة', track: 'الأغنية', editor: 'التصميم', ready: 'التنزيل' };

function AlbumArt({ url }: { url: string | null }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) return <span className="album-placeholder" aria-hidden="true">♪</span>;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="provider-art" src={url} width={48} height={48} alt="" onError={() => setFailed(true)} />;
}
const initial: Draft = { title: '', artist: '', caption: '', template: 'cinematic', scale: 1, x: 0, y: 0 };
const sample: Draft = { ...initial, title: 'ليل ومطر', artist: 'نور الربيع · مثال' };
function Story({ draft, artwork }: { draft: Draft; artwork?: SpotifyPreview }) {
  const [broken, setBroken] = useState<string | null>(null);
  const imageUrl = draft.cover || broken === artwork?.thumbnail ? null : artwork?.thumbnail;
  const [x, y, w] = templates[draft.template].art;
  const ref = useRef<HTMLCanvasElement>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let active = true;
    const buffer = document.createElement('canvas');
    renderStory(buffer, draft, Boolean(imageUrl)).then(() => {
      if (!active) return;
      const canvas = ref.current;
      canvas?.getContext('2d')?.drawImage(buffer, 0, 0);
      setFailed(false);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [draft, imageUrl]);
  return <>{failed && <p role="status">تعذّر عرض المعاينة.</p>}
    <div className="story-surface">
      <canvas ref={ref} className="story-canvas" width={WIDTH} height={HEIGHT} role="img" aria-label="معاينة الستوري" />
      {imageUrl && artwork && <a className="canvas-art" href={artwork.url} target="_blank" rel="noreferrer"
        aria-label="افتح الأغنية في مصدرها"
        style={{ left: x / WIDTH * 100 + '%', top: y / HEIGHT * 100 + '%', width: w / WIDTH * 100 + '%' }}
        onPointerDown={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="غلاف الأغنية" onError={() => setBroken(imageUrl)} />
      </a>}
    </div>
  </>;

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
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'search' | 'manual' | 'link'>('search');
  const [results, setResults] = useState<CatalogTrack[]>([]);
  const [searched, setSearched] = useState(false);
  const [selected, setSelected] = useState<CatalogTrack | null>(null);
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

  function changeMode(next: typeof mode) {
    request.current?.abort();
    request.current = null;
    setLoading(false);
    setError('');
    setMode(next);
  }

  async function searchSongs() {
    const term = query.trim();
    if (term.length < 2) return;
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setLoading(true);
    setError('');
    setSearched(false);
    setResults([]);
    try {
      const response = await fetch('/api/song-search?q=' + encodeURIComponent(term), { signal: controller.signal });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'تعذّر البحث.');
      if (!controller.signal.aborted) {
        setResults(data.tracks);
        setSearched(true);
      }
    } catch (cause) {
      if (!controller.signal.aborted) setError((cause as Error).message || 'تعذّر البحث.');
    } finally {
      if (request.current === controller) setLoading(false);
    }
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
      setSelected(null);
      setDraft((current) => ({ ...current, title: data.title || current.title, artist: data.artist || current.artist }));
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

  const canonical = selected?.url ?? (mode === 'link' ? canonicalTrack(trackUrl) : null);
  return <main className="app-shell"><div className="phone-frame">
    <div className="brand-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/assets/mark.svg" alt="" width={35} height={35} />
      <span>أغنية لهاللقطة</span>
    </div>
    {step !== 'start' && <ol className="steps" aria-label="خطوات إعداد الستوري">
      {(['track', 'editor', 'ready'] as const).map((item) => <li key={item} aria-current={step === item ? 'step' : undefined}>{steps[item]}</li>)}
    </ol>}
    <div className="page-content">
      {step === 'start' && <>
        <section className="hero"><h1>أغنية<br />لهاللقطة</h1><p>اختار صورتك وأغنية تشبهها، وسوّي ستوري بطريقتك.</p></section>
        <div className="sample-wrap"><Story draft={sample} /></div>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="bottom-action"><FilePicker onImage={(file) => void pick(file, 'image', true)} label={busy ? 'جارٍ تجهيز الصورة…' : 'اختار صورة'} disabled={busy} /></div>
      </>}
      {step === 'track' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">اختار أغنية</h1>
        <p className="section-copy">ابحث باسم الأغنية أو الفنان، واختار النتيجة حتى تكمل الستوري.</p>
        <nav className="track-modes" aria-label="طريقة اختيار الأغنية">
          {([['search', 'بحث'], ['manual', 'إدخال يدوي'], ['link', 'رابط Spotify']] as const).map(([id, label]) =>
            <button key={id} className="mode-btn" aria-pressed={mode === id} onClick={() => changeMode(id)}>{label}</button>)}
        </nav>
        {mode === 'search' && <>
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); void searchSongs(); }}>
            <input className="input" type="search" enterKeyHint="search" dir="auto" aria-label="اسم الأغنية أو الفنان" placeholder="مثلاً فيروز أو كيفك إنت" maxLength={100} value={query} onChange={(event) => {
              updateUrl('');
              setQuery(event.target.value);
              setSearched(false);
              setResults([]);
            }} />
            <button className="primary-btn" disabled={loading || query.trim().length < 2}>بحث</button>
          </form>
          {loading && <p className="status" role="status">جاري البحث…</p>}
          {searched && results.length === 0 && <p className="status" role="status">ما لكينا نتائج. جرّب اسم الفنان أو كتابة ثانية.</p>}
          {results.length > 0 && <ul className="results" aria-label="نتائج البحث">
            {results.map((track) => <li key={track.id}>
              <button className="result" onClick={() => {
                setSelected(track);
                setDraft((current) => ({ ...current, title: track.title, artist: track.artist, cover: current.title === track.title && current.artist === track.artist ? current.cover : undefined }));
                go('editor');
              }}>
                <AlbumArt key={track.thumbnail} url={track.thumbnail} />
                <span className="track-meta"><b dir="auto">{track.title}</b><small dir="auto">{track.artist}</small></span>
              </button>
              <a className="source-link" href={track.url} target="_blank" rel="noreferrer" aria-label={'افتح ' + track.title + ' على Deezer'}>Deezer ↗</a>
            </li>)}
          </ul>}
        </>}
        {mode === 'link' && <>
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); void previewSpotify(); }}>
            <input className="input url-field" dir="ltr" inputMode="url" aria-label="رابط Spotify" maxLength={500} value={trackUrl} onChange={(event) => updateUrl(event.target.value)} placeholder="open.spotify.com/track/…" />
            <button className="primary-btn" disabled={loading || !trackUrl.trim()}>{loading ? 'لحظة…' : 'اعرض'}</button>
          </form>
          {preview && <div className="notice"><a className="track-row" href={preview.url} target="_blank" rel="noreferrer">
            <AlbumArt key={preview.thumbnail} url={preview.thumbnail} /><span className="track-meta"><b dir="auto">{preview.title || 'الأغنية'}</b>{preview.artist && <small dir="auto">{preview.artist}</small>}<small>افتح على Spotify</small></span>
          </a></div>}
        </>}
        {mode !== 'search' && <>
          <label className="field"><span>اسم الأغنية</span><input className="input" dir="auto" maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="field"><span>الفنان</span><input className="input" dir="auto" maxLength={80} value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} /></label>
          <div className="cover-upload"><FilePicker label={draft.cover ? 'بدّل غلافك' : 'أضف غلافك'} disabled={busy} onImage={(file) => void pick(file, 'cover')} /><span>اختياري، صورة تملك حق استخدامها</span></div>
          {draft.cover && <button className="mini-btn" onClick={() => setDraft({ ...draft, cover: undefined })}>إزالة الغلاف</button>}
          <button className="primary-btn full" disabled={busy} onClick={() => {
            if (!draft.title.trim() || !draft.artist.trim()) { setError('اكتب اسم الأغنية والفنان حتى نكمل.'); return; }
            setSelected(null);
            go('editor');
          }}>اختار القالب</button>
        </>}
        {error && <p className="status error" role="alert">{error}</p>}
        <button className="mini-btn back-link" onClick={() => { changeMode('search'); go('start'); }}>رجوع للصورة</button>
      </section>}
      {step === 'editor' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">عدّل الستوري</h1>
        {selected && <div className="chosen-track"><AlbumArt key={selected.thumbnail} url={selected.thumbnail} /><span className="track-meta"><b dir="auto">{selected.title}</b><small dir="auto">{selected.artist}</small></span><a className="source-link" href={selected.url} target="_blank" rel="noreferrer">Deezer ↗</a></div>}
        <div className="preview-card" onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <Story draft={draft} artwork={selected ?? (mode === 'link' ? preview ?? undefined : undefined)} />
        </div>
        <h2 className="template-label">القوالب</h2>
        <div className="template-switcher">{(Object.keys(templates) as Template[]).map((id) => <button key={id} className={draft.template === id ? 'template-btn active' : 'template-btn'} aria-pressed={draft.template === id} onClick={() => setDraft({ ...draft, template: id })}><span className={'template-icon template-' + id} aria-hidden="true"><i /><b /></span>{templates[id].label}</button>)}</div>
        <label className="field"><span>جملة قصيرة (اختياري)</span><textarea className="textarea" dir="auto" rows={2} maxLength={80} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} placeholder="اكتب جملة قصيرة…" /></label>
        <label className="control-row"><span>حجم الصورة</span><input className="range" type="range" min="1" max="2.5" step=".01" value={draft.scale} onChange={(event) => setDraft({ ...draft, scale: Number(event.target.value) })} /></label>
        <div className="zoom-buttons"><button className="mini-btn" onClick={() => setDraft({ ...draft, scale: 1, x: 0, y: 0 })}>إرجاع الصورة</button><FilePicker label="بدّل الصورة" disabled={busy} onImage={(file) => void pick(file, 'image')} /></div>
        {<details className="cover-options">
          <summary>غلاف الستوري</summary>
          <p>غلاف الكتالوج يظهر بالمعاينة. ارفع غلافًا تملك حق استخدامه حتى يظهر بالملف المنزّل.</p>
          <div className="cover-upload"><FilePicker label={draft.cover ? 'بدّل غلافك' : 'أضف غلافك'} disabled={busy} onImage={(file) => void pick(file, 'cover')} />
          {draft.cover && <button className="mini-btn" disabled={busy} onClick={() => setDraft({ ...draft, cover: undefined })}>إزالة الغلاف</button>}</div>
        </details>}
        <p className="editor-hint">حرّك الصورة بإصبعك أو بالماوس داخل القالب.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions"><button className="primary-btn" disabled={busy} onClick={() => go('ready')}>جهّز الستوري</button><button className="secondary-btn" onClick={() => go('track')}>رجوع للأغنية</button></div>
      </section>}
      {step === 'ready' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">ستوريك جاهز</h1>
        <div className="ready-preview"><Story draft={draft} /></div>
        {(selected?.thumbnail || preview?.thumbnail) && !draft.cover && <p className="export-note">هاي معاينة الملف المنزّل. تگدر ترجع وتضيف غلافك من «غلاف الستوري».</p>}
        <div className="dimensions">PNG · 1080 × 1920</div>
        <p className="ready-copy">بعد الرفع، أضف الأغنية من Music أو رابطها من ملصق Link داخل الإنستا.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="primary-btn" disabled={busy} onClick={() => void exportPng()}>{busy ? 'جارٍ تجهيز الملف…' : 'نزّل PNG'}</button>
          <button className="secondary-btn" onClick={() => go('editor')}>رجوع للتعديل</button>
          <button className="secondary-btn" disabled={busy} onClick={() => { setDraft(initial); setSelected(null); setQuery(''); setResults([]); setSearched(false); changeMode('search'); updateUrl(''); go('start'); }}>ستوري جديد</button>
        </div>
        {canonical && <div className="notice"><p className="track-link">{canonical}</p><div className="link-row">
          <button className="secondary-btn" onClick={async () => {
            try { await navigator.clipboard.writeText(canonical); setNotice('اننسخ الرابط.'); }
            catch { setNotice('انسخ الرابط يدويًا من النص أعلاه.'); }
          }}>انسخ الرابط</button><a className="secondary-btn" href={canonical} target="_blank" rel="noreferrer">افتح الأغنية</a>
        </div><p role="status">{notice}</p></div>}
      </section>}
    </div>
  </div></main>;
}
