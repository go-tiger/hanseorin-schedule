'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPsd, type LoadedPsd } from '@/lib/psd';
import { ensureFontsLoaded } from '@/lib/fonts';
import { renderSchedule } from '@/lib/render';
import { TEMPLATE } from '@/lib/template';
import { weekLabel, type ScheduleData } from '@/lib/schedule';

interface Props {
  data: ScheduleData;
}

export function CanvasPreview({ data }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const psdRef = useRef<LoadedPsd | null>(null);
  const illustRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState('PSD 로딩 중...');
  const [debug, setDebug] = useState(false);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const draw = useRef(() => {});

  useEffect(() => {
    draw.current = () => {
      const canvas = canvasRef.current;
      const wrap = wrapRef.current;
      const ctx = canvas?.getContext('2d');
      const psd = psdRef.current;
      if (!canvas || !wrap || !ctx || !psd) return;
      const availW = wrap.clientWidth;
      const availH = wrap.clientHeight;
      if (!availW || !availH) return;

      const aspect = psd.width / psd.height;
      let cssW = availW;
      let cssH = cssW / aspect;
      if (cssH > availH) {
        cssH = availH;
        cssW = cssH * aspect;
      }
      const dpr = window.devicePixelRatio || 1;
      canvas.style.width = `${cssW}px`;
      canvas.style.height = `${cssH}px`;
      canvas.width = Math.round(cssW * dpr);
      canvas.height = Math.round(cssH * dpr);

      renderSchedule({
        ctx,
        psd,
        data,
        illust: illustRef.current,
        scale: canvas.width / psd.width,
        debug,
      });
    };
    draw.current();
  }, [data, debug, ready]);

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    let disposed = false;

    (async () => {
      try {
        await ensureFontsLoaded(TEMPLATE.fonts);
        setStatus('PSD 파싱 중...');
        const psd = await loadPsd(TEMPLATE.psdUrl, TEMPLATE.psdVersion);
        if (disposed) return;
        psdRef.current = psd;
        setStatus('');
        setReady(true);
      } catch (e) {
        if (!disposed) setStatus(String(e instanceof Error ? e.message : e));
      }
    })();

    const ro = new ResizeObserver(() => draw.current());
    ro.observe(wrap);
    return () => {
      disposed = true;
      ro.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!data.imageDataUrl) {
      illustRef.current = null;
      draw.current();
      return;
    }
    const img = new Image();
    img.onload = () => {
      illustRef.current = img;
      draw.current();
    };
    img.src = data.imageDataUrl;
  }, [data.imageDataUrl]);

  async function handleDownload() {
    const psd = psdRef.current;
    if (!psd || downloading) return;
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = psd.width;
      canvas.height = psd.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      renderSchedule({ ctx, psd, data, illust: illustRef.current, scale: 1, debug: false });

      const blob: Blob | null = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${weekLabel(data.startDate)} 시간표.png`;
      a.click();
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div className='flex h-full w-full flex-col items-center justify-center gap-2'>
      <div ref={wrapRef} className='flex min-h-0 w-full flex-1 items-center justify-center'>
        <canvas
          ref={canvasRef}
          className='block rounded-sm shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-line'
          hidden={!!status}
        />
        {status && <p className='text-[13px] text-text-dim'>{status}</p>}
      </div>
      <div className='flex items-center gap-3'>
        <button
          type='button'
          onClick={handleDownload}
          disabled={!!status || downloading}
          className='rounded border border-line bg-surface-raised px-3 py-1.5 text-[13px] text-text transition-colors hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50'
        >
          {downloading ? '다운로드 중...' : 'PNG로 다운로드'}
        </button>
        <label className='flex items-center gap-1.5 text-[11px] text-text-dim'>
          <input
            type='checkbox'
            checked={debug}
            onChange={e => setDebug(e.target.checked)}
            className='accent-[var(--accent)]'
          />
          디버그 (기준점/박스 표시)
        </label>
      </div>
    </div>
  );
}
