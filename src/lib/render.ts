import { DAY_KEYS, type DayKey } from './elements';
import type { LoadedPsd, PsdLayerNode } from './psd';
import { FONT_MAP, TEMPLATE, classifyDaySlots, dayGroupPath, findDayNumberLayer } from './template';
import type { ScheduleData } from './schedule';
import { dayTimeTokens, dayTitleText, weekDayNumbers, weekMonthRange } from './schedule';

const TITLE_PLACEHOLDER = '방송 제목을 작성해주세요.';
const DESC_PLACEHOLDER = '세부 스케줄을 작성해주세요.';

// 요일 카드 텍스트 슬롯의 wrap 폭 (PSD px). 레이어별 bounds.width는
// 원본 텍스트 길이에 따라 제각각이라 카드 공통값을 고정한다.
const TITLE_WRAP_WIDTH = 246;
const DESC_WRAP_WIDTH = 350;

export interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 미리보기에서 클릭/드래그할 수 있는 텍스트 슬롯 */
export interface HitSlot {
  day: DayKey;
  field: 'title' | 'desc';
  box: Box;
}

// 사용자가 입력한 폰트 크기. 비었거나 잘못된 값이면 undefined(=PSD 원본 유지).
function parseSize(v: string): number | undefined {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

interface RenderOpts {
  ctx: CanvasRenderingContext2D;
  psd: LoadedPsd;
  data: ScheduleData;
  illust?: HTMLImageElement | null;
  scale: number;
  debug?: boolean;
  /** 선택된 슬롯 (테두리와 크기 핸들을 그린다) */
  selected?: { day: DayKey; field: 'title' | 'desc' } | null;
}

/** 그린 뒤 클릭 가능한 슬롯 목록을 돌려준다 (히트 테스트용) */
export function renderSchedule({ ctx, psd, data, illust, scale, debug, selected }: RenderOpts): HitSlot[] {
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, psd.width, psd.height);

  const nums = weekDayNumbers(data.startDate);
  const months = weekMonthRange(data.startDate);

  // 요일별 활성 그룹 (온라인/오프라인 중 하나만 표시)
  const visibleGroups = new Set<string>();
  for (const day of DAY_KEYS) {
    visibleGroups.add(dayGroupPath(day, data.days[day].online ? 'online' : 'offline'));
  }
  // 시작/종료 월 표기 (12장 중 계산된 월 1장만 표시)
  visibleGroups.add(`${TEMPLATE.layers.weekStartMonthGroup}/${months.start}月`);
  visibleGroups.add(`${TEMPLATE.layers.weekEndMonthGroup}/${months.end}月`);

  // 요일별 슬롯 분류 (원본 텍스트 레이어는 숨기고 사용자 입력으로 대체)
  const daySlots = DAY_KEYS.map(day => {
    const mode = data.days[day].online ? 'online' : 'offline';
    return { day, mode, slots: classifyDaySlots(psd.byPath, day, mode) };
  });

  // 숨길(=사용자가 덮을) 텍스트 레이어 경로
  const overridden = new Set<string>();
  for (const { slots } of daySlots) {
    for (const n of [slots.date, slots.title, slots.desc, slots.time, slots.offlineLabel]) {
      if (n) overridden.add(n.path);
    }
  }
  const weekStartNode = findDayNumberLayer(psd.byPath, TEMPLATE.layers.weekStartGroup);
  const weekEndNode = findDayNumberLayer(psd.byPath, TEMPLATE.layers.weekEndGroup);
  if (weekStartNode) overridden.add(weekStartNode.path);
  if (weekEndNode) overridden.add(weekEndNode.path);
  // 태그를 끄면 그룹 전체를 숨기고, 켜진 상태에서 닉네임을 입력하면 원본 텍스트를 덮는다.
  const showAuthorTag = data.authorTagEnabled;
  if (showAuthorTag && data.authorTag.trim()) overridden.add(TEMPLATE.layers.authorTag);

  const hasUserImage = !!(illust && data.imageDataUrl);
  const clipNode = psd.byPath.get(TEMPLATE.layers.illustClip);
  const illustBox = clipNode?.maskBounds ?? clipNode?.bounds ?? null;

  // 1) 레이어 합성
  // 일러스트 자리 표시자는 타원 마스크로 클리핑. 사용자 이미지가 있으면
  // 같은 순서(레이어 트리 위치)에서 자리 표시자 대신 그려 위/아래 장식 레이어 순서를 유지한다.
  for (const node of psd.root) {
    paintNode(ctx, node, {
      overridden,
      visibleGroups,
      skipIllustSlot: hasUserImage,
      illustBox,
      userImage: hasUserImage ? illust : null,
      imageTransform: { scale: data.imageScale / 100, dx: data.imageDx, dy: data.imageDy },
      hideAuthorTag: !showAuthorTag,
    });
  }

  // 3) 사용자 텍스트
  const hits: HitSlot[] = [];
  for (const { day, mode, slots } of daySlots) {
    const dd = data.days[day];
    const dateStr = dd.date?.trim() || nums[day];
    if (slots.date) drawText(ctx, slots.date, dateStr, { debug });

    if (mode === 'online') {
      if (slots.title) {
        const box = drawText(ctx, slots.title, dayTitleText(dd) || TITLE_PLACEHOLDER, {
          debug,
          wrapWidth: dd.titleWidth || TITLE_WRAP_WIDTH,
          sizeOverride: parseSize(dd.titleSize),
          dx: dd.titleDx,
          dy: dd.titleDy,
        });
        if (box) hits.push({ day, field: 'title', box });
      }
      if (slots.desc) {
        const box = drawText(ctx, slots.desc, dd.desc || DESC_PLACEHOLDER, {
          debug,
          wrapWidth: dd.descWidth || DESC_WRAP_WIDTH,
          sizeOverride: parseSize(dd.descSize),
          dx: dd.descDx,
          dy: dd.descDy,
        });
        if (box) hits.push({ day, field: 'desc', box });
      }
      if (slots.time) drawVertical(ctx, slots.time, dayTimeTokens(dd), debug, 4);
    } else {
      if (slots.offlineLabel) drawVertical(ctx, slots.offlineLabel, [...'오프라인'], debug);
    }
  }

  drawText(ctx, weekStartNode, nums.mon, { debug });
  drawText(ctx, weekEndNode, nums.sun, { debug });
  if (showAuthorTag && data.authorTag.trim()) {
    drawText(ctx, psd.byPath.get(TEMPLATE.layers.authorTag), `@ ${data.authorTag.trim()}`, { debug });
  }

  if (selected) {
    const hit = hits.find(h => h.day === selected.day && h.field === selected.field);
    if (hit) drawSelection(ctx, hit.box, scale);
  }

  return hits;
}

interface PaintCtx {
  overridden: Set<string>;
  visibleGroups: Set<string>;
  skipIllustSlot: boolean;
  illustBox: PsdLayerNode['bounds'] | null;
  imageTransform: ImageTransform;
  userImage: HTMLImageElement | null;
  hideAuthorTag: boolean;
}

function paintNode(ctx: CanvasRenderingContext2D, node: PsdLayerNode, pc: PaintCtx) {
  if (pc.hideAuthorTag && node.path === TEMPLATE.layers.authorTagGroup) return;

  const isMonthLayer = /^주간날짜\/(시작|끝)\/월 표기\/\d+月$/.test(node.path);
  if (isMonthLayer) {
    if (!pc.visibleGroups.has(node.path)) return;
  } else if (node.hidden) {
    return;
  }

  const isDayModeGroup = /^스케줄표\/[월화수목금토일]\/(온라인|오프라인)$/.test(node.path);
  if (isDayModeGroup && !pc.visibleGroups.has(node.path)) return;

  const isIllustSlot = node.path === TEMPLATE.layers.illustSlot;
  if (isIllustSlot && pc.skipIllustSlot) {
    if (pc.userImage && pc.illustBox) {
      drawIllustration(ctx, pc.illustBox, pc.userImage, pc.imageTransform);
    }
    return;
  }

  if (node.isGroup) {
    for (const child of node.children ?? []) paintNode(ctx, child, pc);
    return;
  }

  if (node.text !== undefined) return; // 텍스트는 오버레이에서 처리
  if (!node.canvas) return;

  // 일러스트 자리 표시자는 타원 마스크 안에만
  if (isIllustSlot && pc.illustBox) {
    const b = pc.illustBox;
    ctx.save();
    ctx.beginPath();
    ctx.ellipse(b.left + b.width / 2, b.top + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(node.canvas, node.bounds.left, node.bounds.top, node.bounds.width, node.bounds.height);
    ctx.restore();
    return;
  }

  ctx.drawImage(node.canvas, node.bounds.left, node.bounds.top, node.bounds.width, node.bounds.height);
}

// sizeOverride: 사용자가 지정한 폰트 크기(PSD 단위). 없으면 레이어 원본 크기.
function specFrom(node: PsdLayerNode, sizeOverride?: number) {
  const tr = node.transform ?? [1, 0, 0, 1, node.bounds.left, node.bounds.top];
  const [sx, , , sy, tx, ty] = tr;
  const scale = (sx + sy) / 2;
  const baseSize = node.fontSize ?? 40;
  const size = sizeOverride ?? baseSize;
  const fontPx = size * scale;
  // PSD의 명시적 leading이 있으면 그걸(스케일 적용) 줄간격으로 사용.
  // 크기를 바꾸면 줄간격도 같은 비율로 따라가야 줄이 겹치지 않는다.
  const baseStep = node.leading ? node.leading * scale : baseSize * scale * 1.2;
  const lineStep = baseStep * (size / baseSize);
  return {
    x: tx,
    y: ty,
    fontPx,
    lineStep,
    family: FONT_MAP[node.font ?? ''] ?? 'sans-serif',
    color: node.color ?? '#000',
    align: (node.align as CanvasTextAlign) ?? 'center',
  };
}

// 글자 단위로 폭에 맞춰 줄바꿈 (한글은 단어 간격이 없어 음절 단위가 자연스러움)
function wrapLine(ctx: CanvasRenderingContext2D, line: string, maxWidth: number): string[] {
  if (!maxWidth || ctx.measureText(line).width <= maxWidth) return [line];
  const out: string[] = [];
  let cur = '';
  for (const ch of line) {
    const next = cur + ch;
    if (cur && ctx.measureText(next).width > maxWidth) {
      out.push(cur);
      cur = ch;
    } else {
      cur = next;
    }
  }
  if (cur) out.push(cur);
  return out;
}

interface DrawTextOpts {
  debug?: boolean;
  wrapWidth?: number;
  sizeOverride?: number;
  /** 사용자가 끌어 옮긴 오프셋 (PSD px) */
  dx?: number;
  dy?: number;
}

function drawText(
  ctx: CanvasRenderingContext2D,
  node: PsdLayerNode | undefined,
  text: string,
  opts: DrawTextOpts = {},
): Box | null {
  if (!node) return null;
  const { debug, wrapWidth, sizeOverride, dx = 0, dy = 0 } = opts;
  const s = specFrom(node, sizeOverride);
  const x = s.x + dx;
  const y = s.y + dy;

  ctx.save();
  ctx.font = `${s.fontPx}px "${s.family}", sans-serif`;
  ctx.fillStyle = s.color;
  ctx.textAlign = s.align;
  ctx.textBaseline = 'alphabetic';

  const rawLines = String(text).split(/\r?\n/);
  const lines = wrapWidth ? rawLines.flatMap(line => wrapLine(ctx, line, wrapWidth)) : rawLines;
  lines.forEach((line, i) => ctx.fillText(line, x, y + i * s.lineStep));

  // 히트 테스트/선택 표시에 쓸 경계 박스.
  // 줄바꿈 폭이 지정된 슬롯은 실제 글자 폭이 아니라 그 폭을 기준으로 잡아야
  // 텍스트가 짧아도 박스가 흔들리지 않는다.
  const textWidth = Math.max(...lines.map(line => ctx.measureText(line).width), 0);
  const boxWidth = wrapWidth || textWidth;
  const boxLeft = s.align === 'center' ? x - boxWidth / 2 : s.align === 'right' ? x - boxWidth : x;
  // fontPx의 상단 여백(어센더) 보정: 첫 줄 baseline보다 위로 fontPx 정도, 마지막 줄 아래로 약간의 디센더.
  const boxTop = y - s.fontPx * 0.8;
  const boxHeight = (lines.length - 1) * s.lineStep + s.fontPx * 1.0;
  const box: Box = { left: boxLeft, top: boxTop, width: boxWidth, height: boxHeight };

  if (debug) markPoint(ctx, x, y, box);
  ctx.restore();
  return box;
}

function drawVertical(
  ctx: CanvasRenderingContext2D,
  node: PsdLayerNode | undefined,
  tokens: string[],
  debug?: boolean,
  baseTokenCount?: number,
) {
  if (!node) return;
  const s = specFrom(node);
  const step = s.lineStep;
  // vertical: ty가 블록 세로 중앙 기준
  const isVerticalCenter = node.orientation === 'vertical';
  // horizontal(시간 등)은 ty가 원본 토큰 수(baseTokenCount) 블록의 첫 줄 baseline이라
  // 실제 토큰 수가 다르면 그 블록 중앙에 맞춰 재배치한다.
  const startY = isVerticalCenter
    ? s.y - ((tokens.length - 1) * step) / 2
    : baseTokenCount
      ? s.y + ((baseTokenCount - tokens.length) * step) / 2
      : s.y;

  ctx.save();
  ctx.font = `${s.fontPx}px "${s.family}", sans-serif`;
  ctx.fillStyle = s.color;
  ctx.textAlign = 'center';
  ctx.textBaseline = isVerticalCenter ? 'middle' : 'alphabetic';
  tokens.forEach((tok, i) => ctx.fillText(tok, s.x, startY + i * step));

  if (debug) {
    const maxWidth = Math.max(...tokens.map(tok => ctx.measureText(tok).width));
    const firstLineY = isVerticalCenter ? startY - s.fontPx / 2 : startY - s.fontPx * 0.8;
    const boxHeight = (tokens.length - 1) * step + s.fontPx * 1.0;
    markPoint(ctx, s.x, s.y, { left: s.x - maxWidth / 2, top: firstLineY, width: maxWidth, height: boxHeight });
  }
  ctx.restore();
}

/** 선택 테두리 크기 핸들의 한 변 길이 (화면 px) */
export const HANDLE_SIZE = 10;

/** 좌우 가운데에 폭 조절 핸들 (줄바꿈 폭만 바꾸므로 세로 핸들은 두지 않는다) */
export function handleCenters(box: Box): Array<{ x: number; y: number; edge: 'left' | 'right' }> {
  const midY = box.top + box.height / 2;
  return [
    { x: box.left, y: midY, edge: 'left' },
    { x: box.left + box.width, y: midY, edge: 'right' },
  ];
}

/** 점이 박스 안에 있는지 */
export function hitTest(box: Box, x: number, y: number): boolean {
  return x >= box.left && x <= box.left + box.width && y >= box.top && y <= box.top + box.height;
}

/** 점이 어느 폭 조절 핸들 위인지 (아니면 null). tol은 PSD px 단위 허용 오차. */
export function hitHandle(box: Box, x: number, y: number, tol: number): 'left' | 'right' | null {
  for (const c of handleCenters(box)) {
    if (Math.abs(x - c.x) <= tol && Math.abs(y - c.y) <= tol) return c.edge;
  }
  return null;
}

function drawSelection(ctx: CanvasRenderingContext2D, box: Box, scale: number) {
  // 캔버스가 scale로 그려지므로 선 두께/핸들은 역으로 나눠 화면상 크기를 고정한다.
  const px = 1 / scale;
  ctx.save();
  ctx.strokeStyle = '#4fa88b';
  ctx.lineWidth = 2 * px;
  ctx.setLineDash([6 * px, 4 * px]);
  ctx.strokeRect(box.left, box.top, box.width, box.height);

  ctx.setLineDash([]);
  ctx.fillStyle = '#4fa88b';
  const h = HANDLE_SIZE * px;
  for (const c of handleCenters(box)) {
    ctx.fillRect(c.x - h / 2, c.y - h / 2, h, h);
  }
  ctx.restore();
}

function markPoint(ctx: CanvasRenderingContext2D, x: number, y: number, b: PsdLayerNode['bounds']) {
  ctx.strokeStyle = 'rgba(255,0,0,0.75)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(x - 14, y);
  ctx.lineTo(x + 14, y);
  ctx.moveTo(x, y - 14);
  ctx.lineTo(x, y + 14);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(0,120,255,0.5)';
  ctx.strokeRect(b.left, b.top, b.width, b.height);
}

interface ImageTransform {
  scale: number;
  dx: number;
  dy: number;
}

function drawIllustration(
  ctx: CanvasRenderingContext2D,
  box: PsdLayerNode['bounds'],
  img: HTMLImageElement,
  t: ImageTransform,
) {
  const { left: x, top: y, width: w, height: h } = box;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height) * (t.scale > 0 ? t.scale : 1);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2 + t.dx, y + (h - dh) / 2 + t.dy, dw, dh);
  ctx.restore();
}
