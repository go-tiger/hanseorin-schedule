'use client';

import { readPsd, type Layer, type Psd } from 'ag-psd';

// 런타임 PSD 로더 + IndexedDB 캐시.
// 첫 방문: fetch → 파싱 → 레이어별 캔버스를 캐시.
// 이후: 캐시에서 즉시 복원 (재파싱 없음).

const DB_NAME = 'schedule-maker';
const STORE = 'psd-cache';
const DB_VERSION = 1;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(key: string, value: unknown): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export interface PsdLayerNode {
  name: string;
  path: string;
  /** 텍스트 레이어면 원본 문자열 */
  text?: string;
  font?: string;
  fontSize?: number;
  /** 줄간격 (autoLeading이면 undefined) */
  leading?: number;
  color?: string;
  align?: string;
  /** [xx, xy, yx, yy, tx, ty] */
  transform?: number[];
  /** 세로쓰기 텍스트면 "vertical" (point-type, justification=center로 tx/ty가 블록 중앙) */
  orientation?: string;
  /** 레이어 경계 (canvas 좌표) */
  bounds: { left: number; top: number; width: number; height: number };
  /** 벡터 마스크 경계 박스 (있을 때) */
  maskBounds?: { left: number; top: number; width: number; height: number };
  /** 클리핑 마스크 레이어 (바로 아래 레이어에 클립됨) */
  clipping?: boolean;
  hidden: boolean;
  isGroup: boolean;
  /** 래스터 레이어의 렌더된 이미지 (그룹/텍스트 제외 시 undefined) */
  canvas?: HTMLCanvasElement;
  children?: PsdLayerNode[];
}

export interface LoadedPsd {
  width: number;
  height: number;
  /** 배경 합성 (모든 텍스트/변동 레이어 숨긴 상태) */
  root: PsdLayerNode[];
  /** path → 노드 빠른 조회 */
  byPath: Map<string, PsdLayerNode>;
}

// ag-psd vectorMask.paths[].knots[].points = [inX,inY, anchorX,anchorY, outX,outY]
function vectorMaskBounds(
  paths: Array<{ knots?: Array<{ points: number[] }> }>,
): { left: number; top: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of paths) {
    for (const k of p.knots ?? []) {
      const pts = k.points;
      for (let i = 0; i < pts.length; i += 2) {
        minX = Math.min(minX, pts[i]);
        maxX = Math.max(maxX, pts[i]);
        minY = Math.min(minY, pts[i + 1]);
        maxY = Math.max(maxY, pts[i + 1]);
      }
    }
  }
  if (!Number.isFinite(minX)) return null;
  return { left: minX, top: minY, width: maxX - minX, height: maxY - minY };
}

function hexColor(c?: unknown): string | undefined {
  if (!c || typeof c !== 'object') return undefined;
  const o = c as Record<string, number>;
  if (!('r' in o) || !('g' in o) || !('b' in o)) return undefined;
  const h = (v: number) => Math.round(v).toString(16).padStart(2, '0');
  return `#${h(o.r)}${h(o.g)}${h(o.b)}`;
}

function toNode(layer: Layer, parentPath: string): PsdLayerNode {
  const path = parentPath ? `${parentPath}/${layer.name ?? ''}` : (layer.name ?? '');
  const left = layer.left ?? 0;
  const top = layer.top ?? 0;
  const right = layer.right ?? left;
  const bottom = layer.bottom ?? top;

  const isGroup = Array.isArray(layer.children);
  const node: PsdLayerNode = {
    name: layer.name ?? '',
    path,
    hidden: layer.hidden ?? false,
    isGroup,
    bounds: { left, top, width: right - left, height: bottom - top },
  };

  if (layer.text) {
    node.text = layer.text.text;
    node.font = layer.text.style?.font?.name;
    node.fontSize = layer.text.style?.fontSize;
    node.leading = layer.text.style?.autoLeading ? undefined : layer.text.style?.leading;
    node.color = hexColor(layer.text.style?.fillColor);
    node.align = layer.text.paragraphStyle?.justification;
    node.transform = layer.text.transform as number[] | undefined;
    node.orientation = layer.text.orientation;
  } else if (!isGroup && layer.canvas) {
    node.canvas = layer.canvas as HTMLCanvasElement;
  }

  // 벡터 마스크가 있으면 그 경계 박스를 계산 (일러스트 클리핑 영역용)
  const vm = layer.vectorMask;
  if (vm?.paths?.length) {
    const box = vectorMaskBounds(vm.paths);
    if (box) node.maskBounds = box;
  }

  node.clipping = layer.clipping ?? false;

  if (isGroup && layer.children) {
    node.children = layer.children.map(c => toNode(c, path));
  }
  return node;
}

function indexNodes(nodes: PsdLayerNode[], map: Map<string, PsdLayerNode>) {
  for (const n of nodes) {
    map.set(n.path, n);
    if (n.children) indexNodes(n.children, map);
  }
}

/**
 * PSD를 로드한다. 캐시가 있으면 재파싱 없이 반환.
 * @param url PSD 경로
 * @param version 캐시 무효화용 (PSD 내용이 바뀌면 올린다)
 */
export async function loadPsd(url: string, version: string): Promise<LoadedPsd> {
  const cacheKey = `psd:${url}:${version}`;

  // 캐시된 원본 ArrayBuffer가 있으면 그걸로 파싱 (네트워크 스킵)
  let buffer: ArrayBuffer | undefined = await idbGet<ArrayBuffer>(cacheKey);
  if (!buffer) {
    // HTTP 디스크 캐시는 대용량(수십 MB) 응답 쓰기에 실패할 수 있으므로 우회.
    // (자체 IndexedDB 캐시를 쓰므로 브라우저 캐시는 불필요)
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error(`PSD 로드 실패: ${res.status}`);
    buffer = await res.arrayBuffer();
    // 오래된 버전 캐시 정리
    await clearOldVersions(url, version);
    await idbSet(cacheKey, buffer);
  }

  const psd: Psd = readPsd(buffer, {
    skipThumbnail: true,
    useImageData: false, // canvas로 받음
  });

  const root = (psd.children ?? []).map(c => toNode(c, ''));
  const byPath = new Map<string, PsdLayerNode>();
  indexNodes(root, byPath);

  return { width: psd.width, height: psd.height, root, byPath };
}

async function clearOldVersions(url: string, keepVersion: string) {
  try {
    const db = await openDB();
    const tx = db.transaction(STORE, 'readwrite');
    const store = tx.objectStore(STORE);
    const keys: IDBValidKey[] = await new Promise((res, rej) => {
      const r = store.getAllKeys();
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    for (const k of keys) {
      if (typeof k === 'string' && k.startsWith(`psd:${url}:`) && k !== `psd:${url}:${keepVersion}`) {
        store.delete(k);
      }
    }
  } catch {
    /* 캐시 정리 실패는 무시 */
  }
}
