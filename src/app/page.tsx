'use client';

import { useEffect, useState } from 'react';
import { ExplorerPanel } from '@/components/ExplorerPanel';
import { EditFormPanel } from '@/components/EditFormPanel';
import { CanvasPreview } from '@/components/CanvasPreview';
import { ResizableSidebar } from '@/components/ResizableSidebar';
import { clearSchedule, emptySchedule, loadSchedule, saveSchedule, type ScheduleData } from '@/lib/schedule';

// VSCode 스타일 3구역
//  - 좌측 탐색기: 스케줄 목록 + 요소 트리
//  - 중앙 상단: 미리보기 (남는 공간, 하단 폼이 커지면 자동 축소)
//  - 중앙 하단: 선택한 요소 편집 폼 (내용 높이만큼, 스크롤 없음)
export default function Home() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [data, setData] = useState<ScheduleData>(emptySchedule);
  const [hydrated, setHydrated] = useState(false);

  // 마운트 후 복원 (hydration 불일치 방지)
  useEffect(() => {
    setData(loadSchedule());
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (hydrated) saveSchedule(data);
  }, [data, hydrated]);

  function reset() {
    clearSchedule();
    setData(emptySchedule());
    setSelectedId(null);
  }

  return (
    <div className='flex h-screen overflow-hidden bg-ground font-body text-text'>
      <ResizableSidebar>
        <ExplorerPanel selectedId={selectedId} onSelect={setSelectedId} onReset={reset} />
      </ResizableSidebar>

      <div className='flex flex-1 flex-col overflow-hidden'>
        <main className='min-h-0 flex-1 overflow-hidden bg-ground p-5'>
          <div className='mx-auto flex h-full max-w-5xl items-center justify-center'>
            <CanvasPreview data={data} />
          </div>
        </main>

        <div className='shrink-0 border-t border-line bg-surface'>
          <EditFormPanel selectedId={selectedId} data={data} onChange={setData} />
        </div>
      </div>
    </div>
  );
}
