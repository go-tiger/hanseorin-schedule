'use client';

import { useEffect, useRef, useState } from 'react';
import { loadPsd, type LoadedPsd } from '@/lib/psd';
import { ensureFontsLoaded } from '@/lib/fonts';
import { HANDLE_SIZE, hitHandle, hitTest, renderSchedule, type HitSlot } from '@/lib/render';
import { TEMPLATE, readDayFontSizes, type DayFontSizes } from '@/lib/template';
import { weekLabel, type DayData, type ScheduleData } from '@/lib/schedule';
import type { DayKey } from '@/lib/elements';

export interface SlotRef {
  day: DayKey;
  field: 'title' | 'desc';
}

interface Props {
  data: ScheduleData;
  /** PSD 파싱 후 요일별 원본 폰트 크기를 상위로 전달 (편집 폼의 기본값 표시용) */
  onFontSizes?: (sizes: Record<DayKey, DayFontSizes>) => void;
  /** 미리보기에서 드래그한 결과를 상위 상태에 반영 */
  onPatchDay?: (day: DayKey, patch: Partial<DayData>) => void;
  /** 미리보기에서 슬롯을 선택하면 편집 폼도 해당 요일로 옮긴다 */
  onSelectDay?: (day: DayKey) => void;
}

export function CanvasPreview({ data, onFontSizes, onPatchDay, onSelectDay }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const psdRef = useRef<LoadedPsd | null>(null);
  const illustRef = useRef<HTMLImageElement | null>(null);
  const [status, setStatus] = useState('PSD 로딩 중...');
  const [debug, setDebug] = useState(false);
  const [ready, setReady] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [selected, setSelected] = useState<SlotRef | null>(null);

  const draw = useRef(() => {});
  // 마지막 렌더에서 계산된 슬롯 박스 (히트 테스트용)
  const hitsRef = useRef<HitSlot[]>([]);
  // 드래그 중인 조작. move는 위치, resize는 줄바꿈 폭을 바꾼다.
  const dragRef = useRef<{
    slot: SlotRef;
    mode: 'move' | 'left' | 'right';
    startX: number;
    startY: number;
    origin: { dx: number; dy: number; width: number };
  } | null>(null);
  // PSD 로드는 마운트 시 한 번만 하므로 콜백은 ref로 참조한다.
  const onFontSizesRef = useRef(onFontSizes);
  useEffect(() => {
    onFontSizesRef.current = onFontSizes;
  }, [onFontSizes]);

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

      hitsRef.current = renderSchedule({
        ctx,
        psd,
        data,
        illust: illustRef.current,
        scale: canvas.width / psd.width,
        debug,
        selected,
      });
    };
    draw.current();
  }, [data, debug, ready, selected]);

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
        onFontSizesRef.current?.(readDayFontSizes(psd.byPath));
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

  /** 포인터 위치를 PSD 좌표로 변환 */
  function toPsdPoint(e: React.PointerEvent | PointerEvent) {
    const canvas = canvasRef.current;
    const psd = psdRef.current;
    if (!canvas || !psd) return null;
    const r = canvas.getBoundingClientRect();
    if (!r.width) return null;
    return {
      x: ((e.clientX - r.left) / r.width) * psd.width,
      y: ((e.clientY - r.top) / r.height) * psd.height,
      /** 화면 1px에 해당하는 PSD px (핸들 판정 허용 오차용) */
      unit: psd.width / r.width,
    };
  }

  function sizeOf(day: DayKey, field: 'title' | 'desc') {
    const dd = data.days[day];
    return field === 'title'
      ? { dx: dd.titleDx, dy: dd.titleDy, width: dd.titleWidth }
      : { dx: dd.descDx, dy: dd.descDy, width: dd.descWidth };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const p = toPsdPoint(e);
    if (!p) return;
    const tol = (HANDLE_SIZE / 2 + 3) * p.unit;

    // 선택된 슬롯의 핸들을 먼저 본다 (박스 모서리는 이웃 슬롯과 겹칠 수 있다).
    if (selected) {
      const cur = hitsRef.current.find(h => h.day === selected.day && h.field === selected.field);
      const edge = cur && hitHandle(cur.box, p.x, p.y, tol);
      if (cur && edge) {
        dragRef.current = {
          slot: selected,
          mode: edge,
          startX: p.x,
          startY: p.y,
          origin: { ...sizeOf(selected.day, selected.field), width: cur.box.width },
        };
        e.currentTarget.setPointerCapture(e.pointerId);
        return;
      }
    }

    // 위에 그려진 슬롯이 우선이라 역순으로 찾는다.
    const hit = [...hitsRef.current].reverse().find(h => hitTest(h.box, p.x, p.y));
    if (!hit) {
      setSelected(null);
      return;
    }
    const slot: SlotRef = { day: hit.day, field: hit.field };
    setSelected(slot);
    onSelectDay?.(hit.day);
    dragRef.current = {
      slot,
      mode: 'move',
      startX: p.x,
      startY: p.y,
      origin: { ...sizeOf(hit.day, hit.field), width: hit.box.width },
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const drag = dragRef.current;
    const p = toPsdPoint(e);
    if (!p) return;

    if (!drag) {
      // 핸들 위에서는 커서를 바꿔 조작 가능함을 알린다.
      const cur = selected && hitsRef.current.find(h => h.day === selected.day && h.field === selected.field);
      const tol = (HANDLE_SIZE / 2 + 3) * p.unit;
      const overHandle = cur && hitHandle(cur.box, p.x, p.y, tol);
      const overText = hitsRef.current.some(h => hitTest(h.box, p.x, p.y));
      e.currentTarget.style.cursor = overHandle ? 'ew-resize' : overText ? 'move' : 'default';
      return;
    }

    const { slot, mode, startX, startY, origin } = drag;
    const isTitle = slot.field === 'title';
    if (mode === 'move') {
      const patch = isTitle
        ? { titleDx: origin.dx + (p.x - startX), titleDy: origin.dy + (p.y - startY) }
        : { descDx: origin.dx + (p.x - startX), descDy: origin.dy + (p.y - startY) };
      onPatchDay?.(slot.day, patch);
      return;
    }

    // 좌/우 핸들: 끄는 방향으로 폭을 늘리고, 가운데 정렬이라 위치는 그대로 둔다.
    const delta = mode === 'right' ? p.x - startX : startX - p.x;
    const width = Math.max(40, origin.width + delta * 2);
    onPatchDay?.(slot.day, isTitle ? { titleWidth: width } : { descWidth: width });
  }

  function endDrag(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!dragRef.current) return;
    dragRef.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
  }

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
          className='block touch-none rounded-sm shadow-[0_8px_40px_-8px_rgba(0,0,0,0.5)] ring-1 ring-line'
          hidden={!!status}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
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
            className='accent-accent'
          />
          디버그 (기준점/박스 표시)
        </label>
      </div>
    </div>
  );
}
