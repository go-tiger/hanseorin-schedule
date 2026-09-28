import { DAY_KEYS } from './elements';
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
}

export function renderSchedule({ ctx, psd, data, illust, scale, debug }: RenderOpts) {
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
      hideAuthorTag: !showAuthorTag,
    });
  }

  // 3) 사용자 텍스트
  for (const { day, mode, slots } of daySlots) {
    const dd = data.days[day];
    const dateStr = dd.date?.trim() || nums[day];
    if (slots.date) drawText(ctx, slots.date, dateStr, debug);

    if (mode === 'online') {
      if (slots.title) {
        drawText(ctx, slots.title, dayTitleText(dd) || TITLE_PLACEHOLDER, debug, TITLE_WRAP_WIDTH, parseSize(dd.titleSize));
      }
      if (slots.desc) {
        drawText(ctx, slots.desc, dd.desc || DESC_PLACEHOLDER, debug, DESC_WRAP_WIDTH, parseSize(dd.descSize));
      }
      if (slots.time) drawVertical(ctx, slots.time, dayTimeTokens(dd), debug, 4);
    } else {
      if (slots.offlineLabel) drawVertical(ctx, slots.offlineLabel, [...'오프라인'], debug);
    }
  }

  drawText(ctx, weekStartNode, nums.mon, debug);
  drawText(ctx, weekEndNode, nums.sun, debug);
  if (showAuthorTag && data.authorTag.trim()) {
    drawText(ctx, psd.byPath.get(TEMPLATE.layers.authorTag), `@ ${data.authorTag.trim()}`, debug);
  }
}

interface PaintCtx {
  overridden: Set<string>;
  visibleGroups: Set<string>;
  skipIllustSlot: boolean;
  illustBox: PsdLayerNode['bounds'] | null;
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
      drawIllustration(ctx, pc.illustBox, pc.userImage);
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

function drawText(
  ctx: CanvasRenderingContext2D,
  node: PsdLayerNode | undefined,
  text: string,
  debug?: boolean,
  wrapWidth?: number,
  sizeOverride?: number,
) {
  if (!node) return;
  const s = specFrom(node, sizeOverride);
  const value = text;

  ctx.save();
  ctx.font = `${s.fontPx}px "${s.family}", sans-serif`;
  ctx.fillStyle = s.color;
  ctx.textAlign = s.align;
  ctx.textBaseline = 'alphabetic';

  const rawLines = String(value).split(/\r?\n/);
  const lines = wrapWidth ? rawLines.flatMap(line => wrapLine(ctx, line, wrapWidth)) : rawLines;
  lines.forEach((line, i) => ctx.fillText(line, s.x, s.y + i * s.lineStep));

  if (debug) {
    const maxWidth = Math.max(...lines.map(line => ctx.measureText(line).width));
    const boxLeft = s.align === 'center' ? s.x - maxWidth / 2 : s.align === 'right' ? s.x - maxWidth : s.x;
    // fontPx의 상단 여백(어센더) 보정: 첫 줄 baseline보다 위로 fontPx 정도, 마지막 줄 아래로 약간의 디센더.
    const boxTop = s.y - s.fontPx * 0.8;
    const boxHeight = (lines.length - 1) * s.lineStep + s.fontPx * 1.0;
    markPoint(ctx, s.x, s.y, { left: boxLeft, top: boxTop, width: maxWidth, height: boxHeight });
  }
  ctx.restore();
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

function drawIllustration(ctx: CanvasRenderingContext2D, box: PsdLayerNode['bounds'], img: HTMLImageElement) {
  const { left: x, top: y, width: w, height: h } = box;
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(x + w / 2, y + h / 2, w / 2, h / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s;
  const dh = img.height * s;
  ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
  ctx.restore();
}
