# 보안·세션 정리 메모

이번 정리 브랜치는 운영 중인 대형 HTML/JS 파일을 직접 대규모 변경하지 않고, 모든 페이지에서 로드되는 `assets/js/security-patches.js`를 중심으로 즉시 위험도가 높은 부분을 완화합니다.

## 적용한 정리

- 동적 HTML 렌더링 이후 남아 있을 수 있는 위험 속성 제거
  - `on*` 이벤트 속성 제거
  - `srcdoc` 제거
  - `javascript:` 링크 제거
  - 새 창 링크에 `rel="noopener noreferrer"` 보정
- 비회원 조회 관련 민감 값의 장기 보관 완화
  - `guestContact`, `guestContactRaw`, `guestContactHyphen`, `guestPwLast4` 등은 `localStorage`에 남기지 않고 `sessionStorage` 중심으로 보관
- 책자/제본 견적 페이지의 `cut10()` 동작 보정
  - 기존 100원 단위 절삭 가능성을 10원 단위 절삭으로 보정
- 기존 견적·관리자·마이페이지의 큰 흐름은 유지
  - Firebase Auth / Firestore / Storage 구조 변경 없음
  - 관리자·고객 접수 UI 구조 변경 없음

## 추가로 직접 수정하면 좋은 항목

1. `assets/js/header.js`
   - 관리자 로그인 시 Firestore role 조회 실패하면 `admin.html` 진입을 허용하지 않도록 fail-closed 처리 필요
   - 표시 이름 등 사용자 입력값은 `innerHTML` 대신 `textContent` 또는 escape 후 삽입 권장

2. `quote-book.html`, `quote-print.html`
   - 작업 가이드 로드 실패 `alert()` 문자열에 실제 줄바꿈이 들어가 있다면 `\n` 또는 백틱 문자열로 수정 필요

3. Firebase Rules
   - `quotes`, `qna`, `users`, `settings`, `notices`, Storage 업로드 경로의 읽기·쓰기 권한 재확인 필요
   - 클라이언트의 `userRole` 값은 표시용으로만 보고, 실제 권한은 Firestore Rules에서 차단해야 함

4. 비회원 주문 조회 방식
   - 연락처 끝 4자리 비밀번호는 추측 가능성이 높으므로 접수번호 + 별도 비밀번호 방식 권장

## 테스트 권장 체크리스트

- 메인 페이지 접속 및 공지/최근 접수/문의 목록 표시
- 책자 견적 금액 계산
- 디지털 인쇄 견적 금액 계산
- 비회원 접수 후 마이페이지 조회
- 새로고침 후 동일 탭에서 비회원 조회 유지 여부
- 관리자 로그인 및 관리자 페이지 접속
- 관리자 파일 다운로드
- 공지 팝업 링크 클릭
