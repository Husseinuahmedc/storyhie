'use client';

import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { decodeImage, photoSlot, renderStory, templates, WIDTH, HEIGHT } from './story';
import type { Draft, Template } from './story';
import { palettes, writingFonts } from './styles';
import { canonicalTrack } from './spotify';

type Step = 'start' | 'track' | 'editor' | 'ready';
type SpotifyPreview = { title: string; artist: string; thumbnail: string | null; url: string };
type CatalogTrack = SpotifyPreview & { id: string; source: string };
const steps: Record<Step, string> = { start: 'Photo', track: 'Song', editor: 'Design', ready: 'Download' };

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
  return <>{failed && <p role="status">Could not show the preview.</p>}
    <div className="story-surface">
      <canvas ref={ref} className="story-canvas" width={WIDTH} height={HEIGHT} role="img" aria-label="Story preview" />
      {imageUrl && artwork && <a className="canvas-art" href={artwork.url} target="_blank" rel="noreferrer"
        aria-label="Open original track"
        style={{ left: x / WIDTH * 100 + '%', top: y / HEIGHT * 100 + '%', width: w / WIDTH * 100 + '%' }}
        onPointerDown={(event) => event.stopPropagation()}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imageUrl} alt="Album cover" onError={() => setBroken(imageUrl)} />
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
  if (file.size > 25 * 1024 * 1024) throw new Error('Choose a photo smaller than 25 MB.');
  const url = URL.createObjectURL(file);
  try {
    let image: HTMLImageElement;
    try { image = await decodeImage(url); }
    catch { throw new Error('Could not open this photo. Try JPG, PNG, or WebP.'); }
    const ratio = Math.min(1, 2160 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Could not prepare the photo.');
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

  useEffect(() => {
    const term = query.trim();
    if (step !== 'track' || mode !== 'search' || term.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const response = await fetch('/api/song-search?q=' + encodeURIComponent(term), { signal: controller.signal });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Search unavailable.');
        if (!controller.signal.aborted) {
          setResults(data.tracks);
          setSearched(true);
        }
      } catch (cause) {
        if (!controller.signal.aborted) setError((cause as Error).message || 'Search unavailable.');
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 350);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [query, mode, step]);

  async function previewSpotify() {
    const url = canonicalTrack(trackUrl);
    if (!url) { setError('Paste a Spotify track link or enter the song manually.'); return; }
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
      if (!response.ok) { setError(data.error || 'Preview unavailable. You can enter the song manually.'); return; }
      setPreview(data);
      setSelected(null);
      setDraft((current) => ({ ...current, title: data.title || current.title, artist: data.artist || current.artist }));
    } catch {
      if (!controller.signal.aborted) setError('Preview unavailable. You can enter the song manually.');
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
    } catch { setError('Could not download the story. Try again.'); }
    finally { setBusy(false); }
  }

  const canonical = selected?.url ?? (mode === 'link' ? canonicalTrack(trackUrl) : null);
  return <main className="app-shell"><div className="phone-frame">
    <div className="brand-row">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img className="brand-mark" src="/assets/mark.svg" alt="" width={35} height={35} />
      <span>StoryHIE</span>
    </div>
    {step !== 'start' && <ol className="steps" aria-label="Story progress">
      {(['track', 'editor', 'ready'] as const).map((item) => <li key={item} aria-current={step === item ? 'step' : undefined}>{steps[item]}</li>)}
    </ol>}
    <div className="page-content">
      {step === 'start' && <>
        <section className="hero"><h1>A song for<br />this moment.</h1><p>Turn a photo and a song into a story.</p></section>
        <div className="sample-wrap"><Story draft={sample} /></div>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="bottom-action"><FilePicker onImage={(file) => void pick(file, 'image', true)} label={busy ? 'Preparing photo…' : 'Choose a photo'} disabled={busy} /></div>
      </>}
      {step === 'track' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">Find a song</h1>
        <p className="section-copy">Search by song or artist. Pick a result to start designing.</p>
        <nav className="track-modes" aria-label="Song selection method">
          {([['search', 'Search'], ['manual', 'Manual entry'], ['link', 'Spotify link']] as const).map(([id, label]) =>
            <button key={id} className="mode-btn" aria-pressed={mode === id} onClick={() => changeMode(id)}>{label}</button>)}
        </nav>
        {mode === 'search' && <>
          <div className="search-form live-search" role="search">
            <input className="input" type="text" enterKeyHint="search" dir="auto" aria-label="Song or artist" placeholder="Song or artist" maxLength={100} value={query} onChange={(event) => {
              updateUrl('');
              setQuery(event.target.value);
              setSearched(false);
              setResults([]);
            }} />
            {query && <button className="mini-btn" onClick={() => { setQuery(''); setResults([]); setSearched(false); setLoading(false); setError(''); }}>Clear</button>}
          </div>
          {loading && <p className="status" role="status">Searching…</p>}
          {searched && results.length === 0 && <p className="status" role="status">No close matches. Try the song name with the artist, or use manual entry.</p>}
          {results.length > 0 && <ul className="results" aria-label="Search results">
            {results.map((track) => <li key={track.id}>
              <button className="result" onClick={() => {
                setSelected(track);
                setDraft((current) => ({ ...current, title: track.title, artist: track.artist, cover: current.title === track.title && current.artist === track.artist ? current.cover : undefined }));
                go('editor');
              }}>
                <AlbumArt key={track.thumbnail} url={track.thumbnail} />
                <span className="track-meta"><b><bdi>{track.title}</bdi></b><small><bdi>{track.artist}</bdi></small></span>
              </button>
              <a className="source-link" href={track.url} target="_blank" rel="noreferrer" aria-label={'Open ' + track.title + ' on ' + track.source}>{track.source} ↗</a>
            </li>)}
          </ul>}
        </>}
        {mode === 'link' && <>
          <form className="search-form" onSubmit={(event) => { event.preventDefault(); void previewSpotify(); }}>
            <input className="input url-field" dir="ltr" inputMode="url" aria-label="Spotify link" maxLength={500} value={trackUrl} onChange={(event) => updateUrl(event.target.value)} placeholder="open.spotify.com/track/…" />
            <button className="primary-btn" disabled={loading || !trackUrl.trim()}>{loading ? 'Loading…' : 'Preview'}</button>
          </form>
          {preview && <div className="notice"><a className="track-row" href={preview.url} target="_blank" rel="noreferrer">
            <AlbumArt key={preview.thumbnail} url={preview.thumbnail} /><span className="track-meta"><b><bdi>{preview.title || 'Track'}</bdi></b>{preview.artist && <small><bdi>{preview.artist}</bdi></small>}<small>Open in Spotify</small></span>
          </a></div>}
        </>}
        {mode !== 'search' && <>
          <label className="field"><span>Song title</span><input className="input" dir="auto" maxLength={100} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} /></label>
          <label className="field"><span>Artist</span><input className="input" dir="auto" maxLength={80} value={draft.artist} onChange={(event) => setDraft({ ...draft, artist: event.target.value })} /></label>
          <div className="cover-upload"><FilePicker label={draft.cover ? 'Replace cover' : 'Add cover'} disabled={busy} onImage={(file) => void pick(file, 'cover')} /><span>Optional. Use artwork you have permission to share.</span></div>
          {draft.cover && <button className="mini-btn" onClick={() => setDraft({ ...draft, cover: undefined })}>Remove cover</button>}
          <button className="primary-btn full" disabled={busy} onClick={() => {
            if (!draft.title.trim() || !draft.artist.trim()) { setError('Enter a song title and artist to continue.'); return; }
            setSelected(null);
            go('editor');
          }}>Continue to design</button>
        </>}
        {error && <p className="status error" role="alert">{error}</p>}
        <button className="mini-btn back-link" onClick={() => { changeMode('search'); go('start'); }}>Back to photo</button>
      </section>}
      {step === 'editor' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">Design your story</h1>
        {selected && <div className="chosen-track"><AlbumArt key={selected.thumbnail} url={selected.thumbnail} /><span className="track-meta"><b><bdi>{selected.title}</bdi></b><small><bdi>{selected.artist}</bdi></small></span><a className="source-link" href={selected.url} target="_blank" rel="noreferrer">{selected.source} ↗</a></div>}
        <label className="editor-font">
          <span>Story font</span>
          <select className="input" value={draft.font ?? ''} onChange={(event) => setDraft({ ...draft, font: (event.target.value || undefined) as Draft['font'] })}>
            <option value="">Auto</option>
            {(['ar', 'en'] as const).map((language) => <optgroup key={language} label={language === 'ar' ? 'Arabic' : 'English'}>
              {(Object.keys(writingFonts) as (keyof typeof writingFonts)[]).filter((id) => id.startsWith(language)).map((id) => <option key={id} value={id}>
                {writingFonts[id].label} · {writingFonts[id].family}
              </option>)}
            </optgroup>)}
          </select>
        </label>
        <div className="preview-card" onPointerDown={(event) => {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
        }} onPointerMove={pointerMove} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}>
          <Story draft={draft} artwork={selected ?? (mode === 'link' ? preview ?? undefined : undefined)} />
        </div>
        <h2 className="template-label">Layout</h2>
        <div className="template-switcher" role="group" aria-label="Story layouts">
          {(Object.keys(templates) as Template[]).map((id) => {
            const { label, photo: [x, y, w, h], art: [ax, ay, size], background } = templates[id];
            return <button key={id} className={draft.template === id ? 'template-btn active' : 'template-btn'} aria-pressed={draft.template === id} onClick={() => setDraft({ ...draft, template: id })}>
              <span className="layout-thumbnail" aria-hidden="true" style={{ background }}>
                <i style={{ left: x / WIDTH * 100 + '%', top: y / HEIGHT * 100 + '%', width: w / WIDTH * 100 + '%', height: h / HEIGHT * 100 + '%' }} />
                <b style={{ left: ax / WIDTH * 100 + '%', top: ay / HEIGHT * 100 + '%', width: size / WIDTH * 100 + '%' }} />
              </span>
              {label}
            </button>;
          })}
        </div>
        <h2 className="template-label">Color</h2>
        <div className="palette-row" aria-label="Story colors">
          <button className="swatch" aria-pressed={!draft.palette} onClick={() => setDraft({ ...draft, palette: undefined })}>Auto</button>
          {(Object.keys(palettes) as (keyof typeof palettes)[]).map((id) => <button key={id} className="swatch" aria-pressed={draft.palette === id} onClick={() => setDraft({ ...draft, palette: id })}><i style={{ background: palettes[id].background }} />{palettes[id].label}</button>)}
        </div>
        <label className="field"><span>Caption (optional)</span><textarea className="textarea" dir="auto" rows={2} maxLength={80} value={draft.caption} onChange={(event) => setDraft({ ...draft, caption: event.target.value })} placeholder="Add a line to your story…" /></label>
        <label className="control-row"><span>Zoom</span><input className="range" type="range" min="1" max="2.5" step=".01" value={draft.scale} onChange={(event) => setDraft({ ...draft, scale: Number(event.target.value) })} /></label>
        <div className="zoom-buttons"><button className="mini-btn" onClick={() => setDraft({ ...draft, scale: 1, x: 0, y: 0 })}>Reset crop</button><FilePicker label="Replace photo" disabled={busy} onImage={(file) => void pick(file, 'image')} /></div>
        {<details className="cover-options">
          <summary>Story cover</summary>
          <p>Add your own cover to include it in the download.</p>
          <div className="cover-upload"><FilePicker label={draft.cover ? 'Replace cover' : 'Add cover'} disabled={busy} onImage={(file) => void pick(file, 'cover')} />
          {draft.cover && <button className="mini-btn" disabled={busy} onClick={() => setDraft({ ...draft, cover: undefined })}>Remove cover</button>}</div>
        </details>}
        <p className="editor-hint">Drag the photo to reposition it.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions"><button className="primary-btn" disabled={busy} onClick={() => go('ready')}>Review story</button><button className="secondary-btn" onClick={() => go('track')}>Change song</button></div>
      </section>}
      {step === 'ready' && <section>
        <h1 ref={heading} tabIndex={-1} className="section-title">Your story is ready</h1>
        <div className="ready-preview"><Story draft={draft} /></div>
        {(selected?.thumbnail || preview?.thumbnail) && !draft.cover && <p className="export-note">This is the downloadable version. Add your own cover in the editor to include it.</p>}
        <div className="dimensions">PNG · 1080 × 1920</div>
        <p className="ready-copy">Add audio with Instagram Music after uploading.</p>
        {error && <p className="status error" role="alert">{error}</p>}
        <div className="form-actions">
          <button className="primary-btn" disabled={busy} onClick={() => void exportPng()}>{busy ? 'Preparing download…' : 'Download PNG'}</button>
          <button className="secondary-btn" onClick={() => go('editor')}>Back to editor</button>
          <button className="secondary-btn" disabled={busy} onClick={() => { setDraft(initial); setSelected(null); setQuery(''); setResults([]); setSearched(false); changeMode('search'); updateUrl(''); go('start'); }}>New story</button>
        </div>
        {canonical && <div className="notice"><p className="track-link">{canonical}</p><div className="link-row">
          <button className="secondary-btn" onClick={async () => {
            try { await navigator.clipboard.writeText(canonical); setNotice('Link copied.'); }
            catch { setNotice('Copy the link from the text above.'); }
          }}>Copy link</button><a className="secondary-btn" href={canonical} target="_blank" rel="noreferrer">Open track</a>
        </div><p role="status">{notice}</p></div>}
      </section>}
    </div>
  </div></main>;
}
