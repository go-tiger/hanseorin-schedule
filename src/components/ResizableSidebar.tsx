'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const MIN_W = 120;
const MAX_W = 400;
const STORAGE_KEY = 'schedule-maker:sidebar-width';

interface Props {
  children: React.ReactNode;
}

// 좌측 탐색기: 기본은 콘텐츠 폭(fit-content), 우측 핸들 드래그로 조절.
// 더블클릭하면 콘텐츠 폭으로 리셋. 조절값은 localStorage에 저장.
export function ResizableSidebar({ children }: Props) {
  const asideRef = useRef<HTMLElement>(null);
  const [width, setWidth] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);

  // 최초 마운트: 저장된 폭 복원
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) setWidth(clamp(Number(saved)));
    } catch {
      /* ignore */
    }
  }, []);

  const startDrag = useCallback((e: React.PointerEvent) => {
    e.preventDefault();
    setDragging(true);

    const startX = e.clientX;
    const startW = asideRef.current?.getBoundingClientRect().width ?? MIN_W;

    function onMove(ev: PointerEvent) {
      const next = clamp(startW + (ev.clientX - startX));
      setWidth(next);
    }
    function onUp() {
      setDragging(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      setWidth(w => {
        if (w != null) {
          try {
            localStorage.setItem(STORAGE_KEY, String(w));
          } catch {
            /* ignore */
          }
        }
        return w;
      });
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }, []);

  function resetWidth() {
    setWidth(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  return (
    <aside
      ref={asideRef}
      className='relative flex shrink-0 flex-col overflow-hidden border-r border-line bg-surface'
      style={{
        width: width != null ? `${width}px` : 'fit-content',
        minWidth: `${MIN_W}px`,
        maxWidth: `${MAX_W}px`,
      }}
    >
      <div className='min-w-0 flex-1 overflow-y-auto'>{children}</div>

      {/* 리사이즈 핸들 */}
      <div
        role='separator'
        aria-orientation='vertical'
        onPointerDown={startDrag}
        onDoubleClick={resetWidth}
        title='드래그하여 크기 조절 · 더블클릭으로 초기화'
        className={`absolute right-0 top-0 h-full w-1 cursor-col-resize transition-colors ${
          dragging ? 'bg-accent' : 'hover:bg-accent/40'
        }`}
      />
    </aside>
  );
}

function clamp(n: number) {
  return Math.max(MIN_W, Math.min(MAX_W, Math.round(n)));
}
