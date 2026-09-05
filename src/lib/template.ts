// 템플릿 정의 (얇은 매핑).
// 좌표/스타일은 PSD 레이어에서 직접 읽는다.
// PSD 편집자가 요일마다 텍스트 레이어 이름을 제각각(placeholder / 실제 내용) 지어놔서
// 이름이 아니라 "그룹 내 역할"로 레이어를 찾는다.

import { DAY_KEYS } from './elements';
import type { DayKey } from './elements';
import type { PsdLayerNode } from './psd';

export interface FontDef {
  family: string;
  url: string;
  weight: number;
}

export const FONT_MAP: Record<string, string> = {
  'HSJiptokki-Black': 'HSJiptokki',
  KERISKEDU_B: 'KERISKEDU',
  KERISKEDUOTF_B: 'KERISKEDU',
  KERISKEDU_R: 'KERISKEDU',
  GumiIndustry: 'GumiIndustry',
};

export const FONTS: FontDef[] = [
  {
    family: 'HSJiptokki',
    url: 'https://cdn.jsdelivr.net/gh/fontbee/font@main/Rabbitstype/HSJiptokki-Black.woff2',
    weight: 400,
  },
  {
    family: 'KERISKEDU',
    url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2601-3@1.0/KERISKEDU_B.woff2',
    weight: 700,
  },
  {
    family: 'GumiIndustry',
    url: 'https://cdn.jsdelivr.net/gh/projectnoonnu/2410-1@1.0/GumiIndustryTTF.woff2',
    weight: 400,
  },
];

// PSD의 요일 그룹 이름 (한글)
const DAY_GROUP_NAME: Record<DayKey, string> = {
  mon: '월',
  tue: '화',
  wed: '수',
  thu: '목',
  fri: '금',
  sat: '토',
  sun: '일',
};

export function dayGroupPath(day: DayKey, mode: 'online' | 'offline'): string {
  return `스케줄표/${DAY_GROUP_NAME[day]}/${mode === 'online' ? '온라인' : '오프라인'}`;
}

const isNumeric = (s?: string) => !!s && /^\d+$/.test(s.trim());
const isVerticalTime = (s?: string) => !!s && /시/.test(s) && /분/.test(s);

export interface DaySlots {
  date: PsdLayerNode | null;
  title: PsdLayerNode | null;
  desc: PsdLayerNode | null;
  time: PsdLayerNode | null;
  offlineLabel: PsdLayerNode | null;
}

// 요일 그룹의 텍스트 레이어를 역할별로 분류
export function classifyDaySlots(byPath: Map<string, PsdLayerNode>, day: DayKey, mode: 'online' | 'offline'): DaySlots {
  const prefix = dayGroupPath(day, mode) + '/';
  const texts: PsdLayerNode[] = [];
  for (const [path, node] of byPath) {
    if (path.startsWith(prefix) && node.text !== undefined) texts.push(node);
  }

  const slots: DaySlots = {
    date: null,
    title: null,
    desc: null,
    time: null,
    offlineLabel: null,
  };

  for (const n of texts) {
    if (isNumeric(n.text)) {
      slots.date = n;
    } else if (isVerticalTime(n.text)) {
      slots.time = n;
    } else if (n.text === '오프라인') {
      slots.offlineLabel = n;
    } else if (n.font === 'GumiIndustry') {
      slots.desc = n;
    } else {
      // 남은 텍스트 = 제목 (KERISKEDU 계열)
      slots.title = n;
    }
  }
  return slots;
}

export const TEMPLATE = {
  id: 'test',
  name: '테스트 템플릿',
  psdUrl: '/templates/test.psd',
  psdVersion: '1',
  fonts: FONTS,
  layers: {
    weekStartDate: '주간날짜/시작/25',
    weekEndDate: '주간날짜/끝/31',
    weekStartMonthGroup: '주간날짜/시작/월 표기',
    weekEndMonthGroup: '주간날짜/끝/월 표기',
    authorTag: '일러스트칸/팬아트 태그/@ 작가님 닉네임',
    illustSlot: '일러스트칸/일러스트 대체용',
    illustClip: '일러스트칸/일러스트칸',
    illustBg: '일러스트칸/칸 배경',
  },
  days: DAY_KEYS,
} as const;
