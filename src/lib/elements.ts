// 수정 가능한 요소 트리 정의

export const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;
export type DayKey = (typeof DAY_KEYS)[number];

export const DAY_LABELS: Record<DayKey, string> = {
  mon: '월요일',
  tue: '화요일',
  wed: '수요일',
  thu: '목요일',
  fri: '금요일',
  sat: '토요일',
  sun: '일요일',
};

export const DAY_HANJA: Record<DayKey, string> = {
  mon: '月',
  tue: '火',
  wed: '水',
  thu: '木',
  fri: '金',
  sat: '土',
  sun: '日',
};

export interface ElementNode {
  id: string;
  label: string;
  /** 하단 편집 폼에서 다룰 필드 종류 */
  kind: 'weekDate' | 'day' | 'illustration';
  /** 요일 요소일 때 해당 요일 키 */
  day?: DayKey;
}

export const ELEMENT_TREE: ElementNode[] = [
  { id: 'weekDate', label: '주간 날짜', kind: 'weekDate' },
  ...DAY_KEYS.map(
    (d): ElementNode => ({
      id: `day:${d}`,
      label: DAY_LABELS[d],
      kind: 'day',
      day: d,
    }),
  ),
  { id: 'illustration', label: '일러스트', kind: 'illustration' },
];
