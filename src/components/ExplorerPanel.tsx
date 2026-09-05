'use client';

import { useState } from 'react';
import { DAY_HANJA, ELEMENT_TREE } from '@/lib/elements';

interface Props {
  selectedId: string | null;
  onSelect: (id: string) => void;
}

// 좌측 탐색기: 스케줄 목록(접이식) + 요소 트리.
// 각 요소 항목에 상태 표시(온라인/오프라인, 입력됨/비어있음)를 붙일 자리를 마련.
export function ExplorerPanel({ selectedId, onSelect }: Props) {
  const [listOpen, setListOpen] = useState(true);
  const [treeOpen, setTreeOpen] = useState(true);

  return (
    <div className='flex h-full flex-col bg-surface text-[13px] text-text'>
      <Section title='스케줄' open={listOpen} onToggle={() => setListOpen(v => !v)}>
        <button className='flex w-full items-center gap-1.5 whitespace-nowrap rounded px-2 py-1 text-left text-text-dim transition-colors hover:bg-surface-raised hover:text-text'>
          <span className='text-accent'>+</span> 새 스케줄
        </button>
        <p className='whitespace-nowrap px-2 py-1 text-xs text-text-dim/70'>저장된 스케줄 없음</p>
      </Section>

      <Section title='요소' open={treeOpen} onToggle={() => setTreeOpen(v => !v)}>
        <ul className='flex flex-col'>
          {ELEMENT_TREE.map(node => {
            const active = selectedId === node.id;
            return (
              <li key={node.id}>
                <button
                  onClick={() => onSelect(node.id)}
                  aria-current={active ? 'true' : undefined}
                  className={`group flex w-full items-center gap-2 whitespace-nowrap rounded px-2 py-1 text-left transition-colors ${
                    active ? 'bg-accent/12 text-text' : 'text-text-dim hover:bg-surface-raised hover:text-text'
                  }`}
                >
                  <span className={`h-3.5 w-[3px] shrink-0 rounded-full ${active ? 'bg-accent' : 'bg-transparent'}`} />
                  {node.day && <span className='font-display text-[11px] text-text-dim'>{DAY_HANJA[node.day]}</span>}
                  <span className='flex-1'>{node.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </Section>
    </div>
  );
}

function Section({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className='border-b border-line'>
      <button
        onClick={onToggle}
        className='flex w-full items-center gap-1 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-text-dim transition-colors hover:text-text'
      >
        <span className='inline-block w-3 text-[8px]'>{open ? '▼' : '▶'}</span>
        {title}
      </button>
      {open && <div className='flex flex-col gap-0.5 px-1.5 pb-2'>{children}</div>}
    </div>
  );
}
