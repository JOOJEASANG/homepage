# Quote Book Calculator Modules

`quote-book.js`의 견적 계산 규칙과 페이지 보조 책임을 안전하게 분리한 모듈 모음입니다.

## 파일 역할

- `calculator-utils.js`: 제본 방식과 무관한 공통 숫자 보정, 단가 구간 조회, 100원 절삭, 제본 페이지/대형 규격 배율 계산
- `saddle-calculator.js`: 중철 전용 4p/장 소책자 계산 및 출력 규격 변환(A5→A4, B5→B4, A4→A3)
- `perfect-calculator.js`: 무선제본 전용 A5/B5 내지 배율과 제본 계산 인터페이스
- `wire-calculator.js`: 와이어 전용 표지비 1/2, A5/B5 내지 배율, 450p 제한과 제본 계산 인터페이스

## 유지해야 하는 계산 원칙

1. 관리자 제본 단가는 `priceConfig.binding[bindingType]` 경로를 그대로 사용합니다.
2. 금액은 기존 정책대로 100원 단위 절삭합니다.
3. 중철은 완성 페이지 4p당 출력 용지 1장으로 계산하고 나머지는 올림합니다.
4. 무선/와이어 A5 내지는 기존 정책대로 A4 기준 70%, B5 컬러는 100%를 유지합니다.
5. 와이어 표지비는 기존 정책대로 일반 표지비의 1/2이며 최대 내지 페이지는 450p입니다.
6. 계산식 변경은 반드시 `npm run test:book`과 Firebase Preview Smoke Test를 통과한 뒤 `main`에 반영합니다.

## 호출 구조

`quote-book.js`는 화면 입력/출력과 전체 견적 조합을 담당하고, 계산 규칙은 위 모듈에서 가져와 사용합니다. 제본별 모듈은 공통 규칙을 `calculator-utils.js`에서 재사용하며 서로의 전용 규칙을 직접 참조하지 않습니다.

## UI / 페이지 지원 모듈

- `quote-item-template.js`: 견적 항목과 내지 섹션 HTML 템플릿만 담당합니다.
- `preview-utils.js`: 이미지 URL 정규화와 내지 그룹 판별 같은 순수 유틸입니다.
- `preview-ui.js`: 이미지 미리보기 모달 DOM 렌더링만 담당합니다.
- `contact-utils.js`: 연락처 정규화/표시, 회원 연락처 추출, SHA-256 헬퍼입니다.
- `quote-storage.js`: 마지막 계산 견적 캐시, 임시저장 키, draft 저장/복원 접근을 담당합니다.
- `quote-form-data.js`: 견적 폼 DOM을 draft/Firestore 제출 데이터로 직렬화합니다. 두 경로의 기존 간지 0장 처리 차이를 유지합니다.
- `quote-request-data.js`: Firestore에 넘길 신규 견적 데이터와 기존 견적 수정 payload를 순수 데이터 변환으로 생성하며 소유/비회원 불변 필드 규칙을 보존합니다.
- `page-state.js`: 관리자 수정 URL 플래그와 `quoteToReload` payload 해석을 담당합니다.
- `guest-session.js`: 비회원 조회 세션 읽기/복원/접수 후 저장 및 마이페이지 lookup 우선순위를 담당합니다.
- `submit-lock.js`: 자동접수/중복접수 방지 잠금을 담당합니다.
- `quote-id.js`: 책자 견적 접수번호 생성을 담당합니다.

가격 계산식이나 실제 Firebase 호출은 위 보조 모듈에 넣지 않습니다. `quote-book.js`는 페이지 흐름, 계산 조합, Firebase 인증, `addDoc`/`setDoc`/`updateDoc`, 첨부파일 업로드 orchestration을 담당합니다.
