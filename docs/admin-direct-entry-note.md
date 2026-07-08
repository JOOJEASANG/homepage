# 관리자 직접 접속 전환

## 변경 내용

- 공개 헤더에서 관리자 로그인 버튼과 관련 모달을 제거합니다.
- Firebase Hosting에서 `/admin` 요청을 `/admin.html`로 rewrite합니다.
- `/admin` 주소로 접속해도 관리자 페이지 보정 스크립트가 정상 동작하도록 세션 헬퍼의 관리자 페이지 감지 로직을 보정했습니다.

## 관리자 접속 주소

- https://g-print.co.kr/admin

## 참고

- 고객 화면에는 관리자 버튼이 노출되지 않습니다.
- 실제 접근 권한은 기존 Firebase Auth와 Firestore Rules 기준으로 유지됩니다.
