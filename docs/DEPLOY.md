# DEPLOY

## 웹앱 (GitHub Pages) — 현재 배포 경로

- 공개 URL: https://robom-labs.github.io/homebom/
- 소스는 `main`, 배포 산출물은 `gh-pages` 브랜치(root). Pages 설정: Deploy from a branch → gh-pages.

`main` push 후 `.github/workflows/deploy-pages.yml`이 전체 release gate를 통과하면 자동 배포한다.

로컬 사전 검증:

```bash
pnpm install --frozen-lockfile
git diff --check
pnpm typecheck
pnpm test
VITE_NOTICES_URL=https://neqjmxaneibobpedgsnl.functions.supabase.co/notices pnpm build
pnpm test:e2e
node --check apps/web/public/sw.js
VITE_NOTICES_URL=https://neqjmxaneibobpedgsnl.functions.supabase.co/notices node scripts/validate-notices-response.mjs
```

- SPA 라우팅은 HashRouter라 404 우회가 필요 없다.
- `vite.config.ts`의 `base: "/homebom/"`가 저장소 이름과 일치해야 한다.

## 실데이터 연결 (사람 작업 + 함수 배포)

1. https://www.data.go.kr/data/15098547/openapi.do 활용신청 → 마이페이지에서 인증키 복사.
2. Supabase 프로젝트 생성 후:

```bash
supabase login
supabase link --project-ref <프로젝트ref>
supabase secrets set DATA_GO_KR_SERVICE_KEY=<인증키>
supabase db push --linked
supabase functions deploy notices --no-verify-jwt
supabase functions deploy sync-notice-documents --no-verify-jwt
```

3. 함수 URL(`https://<ref>.functions.supabase.co/notices`)을 `apps/web/.env`에 설정:

```
VITE_NOTICES_URL=https://<ref>.functions.supabase.co/notices
```

4. `pnpm build` 후 위 재배포 절차 실행 → 화면 우상단 배지가 "연결 필요"에서 "실공고"로 바뀐다.

주의:

- 서비스키는 절대 `apps/web`(.env의 VITE_ 아닌 변수 포함)이나 커밋에 넣지 않는다. Supabase secrets에만 둔다.
- 무료 서비스키는 일일 트래픽 제한(개발계정 4만)이 있어 함수 응답에는 10분 캐시를, 일반공급 주택형에는 24시간 서버 캐시와 재시도 시간을 둔다.
- `notice_model_cache`, `notice_public_snapshots`, `notice_document_cache`, `notice_collection_conflicts`, `notice_sync_auth`는 RLS를 켜고 공개 정책을 만들지 않은 service-role 전용 테이블이다.
- 공식 문서 동기화 토큰은 마이그레이션이 DB에서 무작위로 만들며 Vault에는 원문, `notice_sync_auth`에는 SHA-256만 저장한다. 저장소나 로그에는 값이 남지 않는다.
- odcloud API가 `returnType=JSON`을 지원하므로 XML 파싱은 불필요(실측 확인).

## 검증 기록

- 실행 시점의 테스트 수와 운영 smoke 결과는 각 GitHub Actions 실행 기록을 정본으로 삼는다.
