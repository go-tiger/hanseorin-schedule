'use client';

import { DAY_HANJA, ELEMENT_TREE, type DayKey } from '@/lib/elements';
import type { DayData, ScheduleData } from '@/lib/schedule';
import type { DayFontSizes } from '@/lib/template';

interface Props {
  selectedId: string | null;
  data: ScheduleData;
  onChange: (next: ScheduleData) => void;
  /** PSD 원본 폰트 크기. 로딩 전이면 null */
  fontSizes: Record<DayKey, DayFontSizes> | null;
}

// 크기 입력칸의 placeholder: PSD 원본 크기를 그대로 보여준다 (로딩 전이면 '원본')
function sizeHint(v?: number): string {
  return v ? String(Math.round(v)) : '원본';
}

// 미리보기 드래그로 바뀐 값들 (폰트 크기는 폼에서 지우면 되므로 제외)
const RESET_LAYOUT: Partial<DayData> = {
  titleDx: 0,
  titleDy: 0,
  descDx: 0,
  descDy: 0,
  titleWidth: 0,
  descWidth: 0,
};

function isMoved(d: DayData): boolean {
  return !!(d.titleDx || d.titleDy || d.descDx || d.descDy || d.titleWidth || d.descWidth);
}

// 하단 패널: 선택한 요소의 편집 폼.
// 필드를 가로로 배치, 높이는 내용에 맞춤 (스크롤 없음).
export function EditFormPanel({ selectedId, data, onChange, fontSizes }: Props) {
  const node = ELEMENT_TREE.find(n => n.id === selectedId);

  if (!node) {
    return (
      <div className='flex items-center gap-2 px-5 py-5 text-[13px] text-text-dim'>
        <span className='font-display text-accent'>左</span>
        왼쪽 탐색기에서 편집할 요소를 선택하세요.
      </div>
    );
  }

  function patchDay(day: DayKey, patch: Partial<DayData>) {
    onChange({
      ...data,
      days: { ...data.days, [day]: { ...data.days[day], ...patch } },
    });
  }

  const day = node.day;
  const dayData = day ? data.days[day] : null;

  return (
    <div className='px-5 pb-5 pt-3.5'>
      <div className='mb-2.5 flex items-center justify-between gap-2'>
        <div className='flex items-center gap-2'>
          {node.day && <span className='font-display text-sm text-text-dim'>{DAY_HANJA[node.day]}</span>}
          <h2 className='font-display text-sm font-bold text-text'>{node.label}</h2>
          {node.kind === 'day' && day && dayData && (
            <label className='ml-2 flex items-center gap-1.5 text-[13px] text-text-dim'>
              <input
                type='checkbox'
                className='accent-accent'
                checked={!dayData.online}
                onChange={e => patchDay(day, { online: !e.target.checked })}
              />
              휴방
            </label>
          )}
        </div>
        {node.kind === 'day' && day && dayData && (
          <div className='flex items-center gap-3.5'>
            {isMoved(dayData) && (
              <button
                type='button'
                onClick={() => patchDay(day, RESET_LAYOUT)}
                title='미리보기에서 끌어 옮긴 위치와 폭을 원래대로'
                className='rounded border border-line bg-surface-raised px-2 py-1 text-[13px] text-text-dim transition-colors hover:border-accent hover:text-accent'
              >
                ↺ 위치 초기화
              </button>
            )}
            <label className='flex items-center gap-1.5 text-[13px] text-text-dim'>
              날짜
              <input
                type='text'
                placeholder='자동 계산'
                value={dayData.date ?? ''}
                onChange={e => patchDay(day, { date: e.target.value })}
                disabled={data.startDateTouched}
                className='w-24 rounded border border-line bg-surface-raised px-2 py-1 font-mono text-[13px] tabular-nums text-text placeholder:text-text-dim/50 focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
              />
            </label>
          </div>
        )}
      </div>

      {node.kind === 'day' && day && dayData && (
        <div className='flex flex-wrap items-start gap-3.5'>
          <div className='flex flex-col gap-3'>
            <div className='flex flex-wrap items-end gap-3.5'>
              <button
                type='button'
                onClick={() => patchDay(day, { twice: !dayData.twice })}
                className='mb-1.5 rounded border border-line bg-surface-raised px-2.5 py-1.5 text-[13px] text-text transition-colors hover:border-accent hover:text-accent'
              >
                {dayData.twice ? '- 일정' : '+ 일정'}
              </button>
              <Field
                label='방송 제목'
                placeholder='방송 제목'
                className='min-w-56 flex-1'
                value={dayData.title}
                onChange={v => patchDay(day, { title: v })}
              />
              <Field
                label='크기'
                placeholder={sizeHint(fontSizes?.[day].title)}
                className='w-12'
                mono
                strongPlaceholder
                value={dayData.titleSize}
                onChange={v => patchDay(day, { titleSize: v })}
              />
            </div>

            <div className='flex flex-wrap items-end gap-3.5'>
              <div aria-hidden className='invisible rounded border px-2.5 py-1.5 text-[13px]'>
                - 일정
              </div>
              <Field
                label='방송 제목 2'
                placeholder='방송 제목 2'
                className='min-w-56 flex-1'
                value={dayData.title2}
                onChange={v => patchDay(day, { title2: v })}
                disabled={!dayData.twice}
              />
              {/* 제목 크기는 두 줄 공통이라 빈 칸으로 정렬만 맞춘다 */}
              <div aria-hidden className='invisible w-12' />
            </div>
          </div>

          <div className='flex min-w-56 flex-1 items-start gap-3.5'>
            <label className='flex min-w-40 flex-1 flex-col gap-1'>
              <span className='text-[10px] font-semibold uppercase tracking-widest text-text-dim'>세부 스케줄</span>
              <textarea
                placeholder='세부 스케줄'
                rows={4}
                value={dayData.desc}
                onChange={e => patchDay(day, { desc: e.target.value })}
                className='w-full resize-none rounded border border-line bg-surface-raised px-2.5 py-1.5 text-[13px] text-text placeholder:text-text-dim/50 focus:border-accent focus:outline-none'
              />
            </label>
            <Field
              label='크기'
              placeholder={sizeHint(fontSizes?.[day].desc)}
              className='w-12'
              mono
              strongPlaceholder
              value={dayData.descSize}
              onChange={v => patchDay(day, { descSize: v })}
            />
          </div>

          <div className='flex flex-col gap-3'>
            <Field
              label='시'
              placeholder='0'
              className='w-16'
              mono
              value={dayData.hour}
              onChange={v => patchDay(day, { hour: v })}
            />
            <Field
              label='시'
              placeholder='0'
              className='w-16'
              mono
              value={dayData.hour2}
              onChange={v => patchDay(day, { hour2: v })}
              disabled={!dayData.twice}
            />
          </div>

          {!dayData.twice && (
            <Field
              label='분'
              placeholder='0'
              className='w-16'
              mono
              value={dayData.minute}
              onChange={v => patchDay(day, { minute: v })}
            />
          )}
        </div>
      )}

      {node.kind === 'weekDate' && (
        <div className='flex flex-wrap items-end gap-3.5'>
          <Field
            label='시작 날짜'
            type='date'
            className='w-44'
            value={data.startDate}
            onChange={v => onChange({ ...data, startDate: v, startDateTouched: true })}
          />
          <span className='pb-1.5 text-xs text-text-dim'>종료일 자동 계산 (월~일)</span>
        </div>
      )}

      {node.kind === 'illustration' && (
        <div className='flex flex-wrap items-end gap-3.5'>
          <div className='flex min-w-64 flex-1 flex-col gap-1'>
            <div className='flex items-center gap-2.5'>
              <span className='text-[10px] font-semibold uppercase tracking-widest text-text-dim'>작가 닉네임</span>
              <label className='flex items-center gap-1.5 text-[13px] text-text-dim'>
                <input
                  type='checkbox'
                  className='accent-accent'
                  checked={!data.authorTagEnabled}
                  onChange={e => onChange({ ...data, authorTagEnabled: !e.target.checked })}
                />
                태그 숨김
              </label>
            </div>
            <div
              className={`flex items-center gap-1 rounded border border-line bg-surface-raised px-2.5 py-1.5 focus-within:border-accent ${
                data.authorTagEnabled ? '' : 'opacity-50'
              }`}
            >
              <span className='text-[13px] text-text-dim'>@</span>
              <input
                type='text'
                placeholder='작가님 닉네임'
                value={data.authorTag}
                onChange={e => onChange({ ...data, authorTag: e.target.value })}
                disabled={!data.authorTagEnabled}
                className='w-full bg-transparent text-[13px] text-text placeholder:text-text-dim/50 focus:outline-none disabled:cursor-not-allowed'
              />
            </div>
          </div>
          <label className='flex flex-col gap-1 flex-1'>
            <span className='text-[10px] font-semibold uppercase tracking-widest text-text-dim'>이미지 업로드</span>
            <input
              type='file'
              accept='image/*'
              className='w-full rounded border border-line bg-surface-raised px-2.5 py-1.5 text-[13px] text-text file:mr-2 file:rounded file:border-0 file:bg-accent/15 file:px-2 file:py-0.5 file:text-accent'
              onChange={e => {
                const file = e.target.files?.[0];
                if (!file) return;
                const reader = new FileReader();
                reader.onload = () => {
                  onChange({ ...data, imageDataUrl: String(reader.result) });
                };
                reader.readAsDataURL(file);
              }}
            />
          </label>
        </div>
      )}
    </div>
  );
}

function Field({
  label,
  placeholder,
  type = 'text',
  className = '',
  mono = false,
  value,
  onChange,
  disabled = false,
  strongPlaceholder = false,
}: {
  label: string;
  placeholder?: string;
  type?: string;
  className?: string;
  mono?: boolean;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** placeholder가 힌트가 아니라 현재 적용값일 때 (폰트 크기 등) 진하게 */
  strongPlaceholder?: boolean;
}) {
  return (
    <label className={`flex flex-col gap-1 ${className}`}>
      <span className='text-[10px] font-semibold uppercase tracking-widest text-text-dim'>{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        value={value}
        onChange={e => onChange(e.target.value)}
        disabled={disabled}
        className={`w-full rounded border border-line bg-surface-raised px-2.5 py-1.5 text-[13px] text-text focus:border-accent focus:outline-none disabled:cursor-not-allowed disabled:opacity-50 ${
          strongPlaceholder ? 'placeholder:text-text-dim' : 'placeholder:text-text-dim/50'
        } ${mono ? 'font-mono tabular-nums' : ''}`}
      />
    </label>
  );
}
