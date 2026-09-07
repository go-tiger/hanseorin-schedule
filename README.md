# 스케줄 메이커

주간 방송 스케줄표 이미지를 브라우저에서 만드는 정적 웹앱.
디자이너가 만든 PSD 템플릿을 런타임에 파싱해 캔버스로 렌더링하고,
요일별 방송 정보와 일러스트를 입력해 PNG로 내보낸다.

## 사용 흐름

1. 좌측 탐색기에서 편집할 요소를 선택 (주간 날짜 / 월~일 / 일러스트)
2. 하단 폼에서 방송 제목, 세부 스케줄, 시간, 휴방 여부 등을 입력
3. 중앙 미리보기에서 실시간 확인
4. `PNG로 다운로드`

## 개발

```bash
npm install
npm run dev
```

[http://localhost:3000](http://localhost:3000) 접속.

PSD 템플릿은 리포에 포함되어 있지 않다. 로컬 개발 시
`public/templates/schedule.psd` 경로에 템플릿 파일을 직접 두어야 한다.

## 빌드 / 배포

- `npm run build` — `output: "export"`로 `out/` 에 정적 파일 생성
- push to `main` → GitHub Actions가 `secrets.PSD_SOURCE_URL`에서 PSD를 받아
  빌드 후 GitHub Pages에 배포 ([.github/workflows/deploy.yml](.github/workflows/deploy.yml))
- `basePath` 는 `/hanseorin-schedule` ([next.config.ts](next.config.ts))

## 구조

| 경로                                      | 역할                                                            |
| ----------------------------------------- | --------------------------------------------------------------- |
| [src/app/page.tsx](src/app/page.tsx)       | VSCode 스타일 3분할 레이아웃 (탐색기 / 미리보기 / 편집 폼)      |
| [src/components/](src/components/)         | ExplorerPanel, EditFormPanel, CanvasPreview, ResizableSidebar   |
| [src/lib/psd.ts](src/lib/psd.ts)           | PSD fetch +`ag-psd` 파싱, 원본 ArrayBuffer를 IndexedDB에 캐시 |
| [src/lib/template.ts](src/lib/template.ts) | PSD 레이어를 이름이 아닌 "그룹 내 역할"로 탐색, 폰트 정의       |
| [src/lib/schedule.ts](src/lib/schedule.ts) | 상태 모델. 시작일(월요일)로부터 요일별 날짜 / 월 범위 파생      |
| [src/lib/render.ts](src/lib/render.ts)     | 캔버스 레이어 합성 + 사용자 텍스트 오버레이                     |
| [src/lib/fonts.ts](src/lib/fonts.ts)       | CDN 웹폰트를 FontFace API로 로드                                |

### 설계 메모

- PSD가 단일 진실 공급원. 좌표 / 폰트 / 색 / 줄간격을 코드에 하드코딩하지 않고
  레이어에서 직접 읽는다.
- PSD 편집자가 요일마다 텍스트 레이어 이름을 제각각(placeholder / 실제 내용) 지어서,
  이름이 아니라 그룹 내 역할로 레이어를 찾는다 (`classifyDaySlots`, `findDayNumberLayer`).
- 툴 UI는 다크 테마 고정. 결과물(미리보기)만 원본 색을 그대로 렌더한다.

## 스택

Next.js 16 (App Router, 정적 export) · React 19 · Tailwind CSS v4 · ag-psd · TypeScript
