import { DAY_KEYS, type DayKey } from './elements';

export interface DayData {
  online: boolean;
  /** 날짜 숫자 (미지정 시 주간 계산값 사용) */
  date?: string;

  /** 하루 2회 방송 여부 */
  twice: boolean;

  // 1회차 (twice=false면 유일한 방송)
  title: string;
  desc: string;
  hour: string;
  minute: string;

  // 2회차 (twice=true일 때만 사용, 시 단위만)
  title2: string;
  hour2: string;

  /** 폰트 크기 (pt). 빈 문자열이면 PSD 원본 크기 사용 */
  titleSize: string;
  descSize: string;
}

export interface ScheduleData {
  startDate: string; // ISO yyyy-mm-dd, 주 시작(월요일)
  /** 사용자가 시작 날짜를 직접 수정했는지 (false면 자동 계산값) */
  startDateTouched: boolean;
  authorTagEnabled: boolean;
  authorTag: string;
  imageDataUrl: string | null;
  days: Record<DayKey, DayData>;
}

export function emptyDay(): DayData {
  return {
    online: true,
    twice: false,
    title: '',
    desc: '',
    hour: '',
    minute: '',
    title2: '',
    hour2: '',
    titleSize: '',
    descSize: '',
  };
}

// 로컬 날짜를 ISO yyyy-mm-dd로 (toISOString은 UTC라 자정 근처에 날짜가 밀림)
function toLocalIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** 오늘 이후 돌아오는 첫 월요일 (ISO yyyy-mm-dd). 오늘이 월요일이면 다음 주 월요일. */
function nextMonday(): string {
  const d = new Date();
  const dow = d.getDay(); // 0=일 ~ 6=토, 월=1
  const diff = (1 - dow + 7) % 7 || 7;
  d.setDate(d.getDate() + diff);
  return toLocalIso(d);
}

export function emptySchedule(): ScheduleData {
  const days = {} as Record<DayKey, DayData>;
  for (const k of DAY_KEYS) days[k] = emptyDay();
  return {
    startDate: nextMonday(),
    startDateTouched: false,
    authorTagEnabled: true,
    authorTag: '',
    imageDataUrl: null,
    days,
  };
}

// --- 로컬 스토리지 ---

const STORAGE_KEY = 'schedule-maker:data';

export function loadSchedule(): ScheduleData {
  if (typeof window === 'undefined') return emptySchedule();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptySchedule();
    const parsed = JSON.parse(raw) as Partial<ScheduleData>;
    const base = emptySchedule();
    const days = {} as Record<DayKey, DayData>;
    for (const k of DAY_KEYS) days[k] = { ...emptyDay(), ...parsed.days?.[k] };
    return { ...base, ...parsed, days };
  } catch {
    return emptySchedule();
  }
}

export function saveSchedule(data: ScheduleData): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // 용량 초과 등은 무시
  }
}

export function clearSchedule(): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // 무시
  }
}

// --- 렌더용 파생 값 ---

/** 제목 표기: 2회면 "제목1 / 제목2" (세로 3줄) */
export function dayTitleText(d: DayData): string {
  if (d.twice) return `${d.title}\n/\n${d.title2}`;
  return d.title;
}

/** 시간 표기 토큰 (세로 배열) */
export function dayTimeTokens(d: DayData): string[] {
  if (d.twice) {
    return [d.hour || '0', '시', '/', d.hour2 || '0', '시'];
  }
  return [d.hour || '0', '시', d.minute || '0', '분'];
}

// 입력한 날짜가 속한 주의 월요일
function weekMonday(startDate: string): Date {
  const base = new Date(startDate + 'T00:00:00');
  const dow = base.getDay(); // 0=일
  const diff = dow === 0 ? -6 : 1 - dow;
  base.setDate(base.getDate() + diff);
  return base;
}

// 시작일(월요일 기준)로부터 요일별 날짜 숫자
export function weekDayNumbers(startDate: string): Record<DayKey, string> {
  const base = weekMonday(startDate);
  const out = {} as Record<DayKey, string>;
  DAY_KEYS.forEach((k, i) => {
    const d = new Date(base);
    d.setDate(base.getDate() + i);
    out[k] = String(d.getDate());
  });
  return out;
}

/** 주 시작(월요일)과 끝(일요일)의 월(1~12) */
export function weekMonthRange(startDate: string): { start: number; end: number } {
  const mon = weekMonday(startDate);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  return { start: mon.getMonth() + 1, end: sun.getMonth() + 1 };
}

/** 시작일(월요일) 기준 "n월 n일 ~ n월 n일" 형식의 주간 라벨. */
export function weekLabel(startDate: string): string {
  const mon = weekMonday(startDate);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  const fmt = (d: Date) => `${d.getMonth() + 1}월 ${String(d.getDate()).padStart(2, '0')}일`;
  return `${fmt(mon)} ~ ${fmt(sun)}`;
}
