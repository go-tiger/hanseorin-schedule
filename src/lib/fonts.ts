// 템플릿 폰트를 CDN에서 로드 (FontFace API).
// 렌더 전에 ensureFontsLoaded()를 await 해서 캔버스에 깨진 폰트가 안 그려지게 한다.

interface FontDef {
  family: string;
  url: string;
  weight?: number;
}

const loaded = new Map<string, Promise<void>>();

export function loadFont(def: FontDef): Promise<void> {
  const key = `${def.family}:${def.url}`;
  const existing = loaded.get(key);
  if (existing) return existing;

  const p = (async () => {
    if (typeof document === 'undefined') return;
    const face = new FontFace(def.family, `url(${def.url})`, {
      weight: String(def.weight ?? 400),
      display: 'swap',
    });
    await face.load();
    document.fonts.add(face);
  })();

  loaded.set(key, p);
  return p;
}

export async function ensureFontsLoaded(defs: FontDef[]): Promise<void> {
  await Promise.all(defs.map(loadFont));
  // 브라우저 폰트 로딩 파이프라인이 안정될 때까지
  if (typeof document !== 'undefined') {
    await document.fonts.ready;
  }
}
