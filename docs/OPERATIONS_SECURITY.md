# 운영 보안 및 백업 기준

## 2026-10-08 서버 배포 진행 상태

- Firestore·Storage 규칙은 권한 설정 후 운영 프로젝트에 배포했습니다. 배포 작업: https://github.com/JOOJEASANG/homepage/actions/runs/37606260731
- Functions의 실행 계정 사용 권한 오류도 해결됐습니다. 이후 전체 함수 진입점이 AI 모듈의 `GEMINI_API_KEY` 메타데이터 조회를 요구해 배포가 중단됐습니다.
- 문의·비회원 조회 배포는 `customer-access.js` 진입점을 사용하여 두 HTTP 함수만 내보냅니다. 배포 작업 안에서만 `package.json`의 진입점을 선택하며, 기존 전체 함수 진입점은 유지합니다. 배포 대상 필터도 두 함수로 제한합니다.
- API 배포 성공과 실제 조회 검증 전에는 `qnaApiV2`·`guestLookupApiV2`를 활성화하지 않습니다.

## 2026-10-07 작업가이드·문의 수신확인·관리자 견적 이동 수정

- 수정 전 코드는 `270518c`와 `backup/main-2026-10-07-before-customer-center-fixes`에 보존했습니다.
- 작업가이드는 Firebase 초기화가 늦거나 실패해도 공통 메뉴에서 레이어로 열립니다. 홈·견적·마이페이지의 오래된 HTML 삽입 로더를 제거했고, 직접 주소로 접근해도 목록이 표시됩니다.
- 관리자 디지털출력 계산 화면은 고객의 임시 견적이 남아 있어도 관리자 화면으로 되돌아가지 않습니다. 계산 모드에서는 고객 견적 접수를 차단합니다.
- 고객센터에 문의 작성·답변 확인·FAQ 바로가기, Enter 키 조회, 등록 직후 답변 확인 버튼을 추가했습니다. 조회용 비밀번호는 현재 입력란에만 유지하며 브라우저 저장소나 URL에 기록하지 않습니다.
- 문의 조회는 한 경로에서 처리하고, 비밀번호 검증을 통과한 문서만 실시간 구독합니다. 새 문의는 인증된 `ownerUid`를 저장하고, 새 보안 규칙은 그 소유자에게만 비공개 문서 읽기를 허용합니다.
- 관리자 답변과 수신 상태 초기화를 한 번에 저장합니다. 고객 확인 뒤 상태를 되돌리던 900ms 타이머를 제거했습니다. 고객 수신확인은 표시한 답변 버전과 현재 저장된 답변을 트랜잭션으로 비교한 뒤 기록합니다.
- 관리자 목록과 열린 대화의 수신 상태도 실시간 갱신합니다. 작성 중인 답변은 유지합니다. 고객이 FAQ를 보고 있거나 브라우저 탭이 숨겨진 동안 도착한 답변은 대화 화면으로 돌아온 뒤 확인 처리합니다.
- 수신확인 저장 실패를 성공으로 표시하지 않으며, 고객 화면에서 재시도할 수 있습니다. 익명 로그인 초기화도 공유하여 동시 조회 때문에 다른 고객 세션이 생성되지 않게 했습니다.

비공개 문의의 운영 서버 연결은 아래 IAM 권한 문제가 해결되어야 마무리할 수 있습니다. 현재 `qnaSecure` 운영 주소는 HTTP 404이며, 기존 소유자 정보가 없는 비공개 문의의 안전한 조회·소유권 연결에는 이 API가 필요합니다. API와 규칙을 배포하고 검증하기 전에 `qnaApiV2` 플래그를 먼저 활성화하지 않습니다.

## 2026-10-06 최종 점검 상태

화면 수정은 main과 운영 Hosting에 반영했습니다. 서버 보안 규칙과 비회원 조회·비공개 문의 API 배포는 IAM 권한 부족으로 완료되지 않았습니다. 아래 파일 보존·감사로그·자동 백업 설명은 구현 기준이며, 이번 점검에서 예약 함수의 실제 가동을 확인한 것은 아닙니다.

- 관리자 역할은 `users/{uid}`의 실제 인증 권한으로 검사하며, 브라우저 캐시로 관리 화면을 열 수 없게 했습니다.
- 디지털출력 작업안내는 하나의 로더에서 읽고, 일시적인 실패에만 최대 3회 재시도합니다. 정상 표시 이후 중복 요청으로 내용을 덮어쓰지 않으며 HTML은 표시 전에 검사합니다. 저장 이미지 보존과 단일 읽기 회귀 테스트 2건도 통과했습니다.
- 견적의 필드 추가·삭제, 비회원 견적 소유권 전환, 문의 답변 읽음 처리를 보안 에뮬레이터에서 검증했습니다.
- 보안 시나리오 8건, 안내 로더 수정 후 PC·모바일 통합 브라우저 테스트 100건, 관리자·고객의 실제 디자인 파일 첨부 회귀 테스트 4건이 각각 통과했습니다.
- 파일 선택 취소는 오류 없이 처리하며 관리자·고객 첨부 형식 검사는 공통 정책을 사용합니다. 고객 디자인 파일의 Storage MIME 규칙 반영은 아래 서버 권한 문제 해결 후 배포해야 합니다.
- 운영 Hosting에서 수정 파일 12개의 일치, 관리자 페이지 검색 제외 헤더, 삭제 파일·없는 주소·규칙 파일의 404를 확인했습니다.
- 수정 전 코드는 `backup/main-2026-10-06-before-production-finalization` 브랜치와 main 이력의 `c91783b`에 보존되어 있습니다. 이 백업은 저장소 코드에 대한 것으로 고객 데이터 백업 여부를 의미하지 않습니다.

### 서버 배포를 막고 있는 권한

GitHub Actions의 `FIREBASE_SERVICE_ACCOUNT`에 사용된 계정에 다음 권한이 필요합니다. 키 파일이나 비밀 값을 공개하지 말고, 해당 JSON의 `client_email` 계정을 IAM 설정에서 식별합니다.

1. 프로젝트 `worklist-1e83a`에서 **Firebase Rules Admin** (`roles/firebaserules.admin`). Firestore·Storage 규칙 검사 API가 모두 HTTP 403으로 거절되었습니다.
2. Functions 실행 계정 `worklist-1e83a@appspot.gserviceaccount.com`에서 **Service Account User** (`roles/iam.serviceAccountUser`). Functions 배포가 `iam.serviceAccounts.ActAs` 권한 부족으로 거절되었습니다. Functions 배포 계정의 **Cloud Functions Admin** 권한도 공식 배포 요건에 맞게 설정되어 있어야 합니다.

- [프로젝트 IAM 설정](https://console.cloud.google.com/iam-admin/iam?project=worklist-1e83a)
- [규칙 배포 실패 로그](https://github.com/JOOJEASANG/homepage/actions/runs/37480864768)
- [Functions 배포 실패 로그](https://github.com/JOOJEASANG/homepage/actions/runs/37480321055)
- [공식 Rules 역할](https://docs.cloud.google.com/iam/docs/roles-permissions/firebaserules)
- [공식 Functions 배포 권한](https://firebase.google.com/docs/projects/iam/permissions#cloud_functions_for_firebase_permissions)

Storage 배포 대상은 프런트엔드 설정과 동일한 `worklist-1e83a.firebasestorage.app` 버킷으로 명시했습니다. 기본 버킷 조회 API에 대한 추가 권한 없이도 대상 버킷을 정확하게 지정합니다. Firestore와 Storage 배포 단계는 분리하여 한쪽 문제로 다른 쪽 시도가 생략되지 않게 했습니다.

### 권한 설정 후 마무리 순서

1. 실패한 두 워크플로를 재실행하여 규칙과 `guestQuoteAccess`, `qnaSecure`를 배포합니다. 이번 Functions 워크플로는 이 두 HTTP 함수만 배포하며 예약 정리·자동 백업 함수를 함께 활성화하지 않습니다.
2. 두 API의 CORS·인증 응답과 별도 테스트 주문·문의의 조회를 확인합니다. 운영 고객 문서에 임의의 테스트 변경을 하지 않습니다.
3. `login.html?guestApiV2=1`, `qna.html?qnaApiV2=1`로 정상 조회와 잘못된 비밀번호 거절을 검증한 뒤, `settings/site.guestLookupApiV2`와 `settings/site.qnaApiV2`를 활성화합니다. API 배포와 검증 전에 플래그만 먼저 활성화하지 않습니다.
4. 새 브라우저에서 비회원 주문조회와 비공개 문의 답변 확인을 재검증한 후 전체 운영 완료로 처리합니다.

## 파일 보존

- `quotes/` 아래 고객/관리자 견적 파일은 생성 후 30일이 지난 파일부터 매일 정리합니다.
- 한 번의 실행에서 최대 500개를 삭제하여 대량 삭제로 인한 실행시간 증가를 제한합니다.
- 삭제 수량과 용량만 `audit_logs`에 기록하며 파일명/연락처 같은 개인정보 원문은 감사로그에 남기지 않습니다.

## 견적 감사로그

- `quotes/{quoteId}` 생성/수정/삭제 시 `audit_logs`에 이벤트를 기록합니다.
- 기록 대상은 변경 필드 목록, 전후 상태, 결제상태, 상품유형, 소유자 해시입니다.
- `actorHint`는 문서의 `updatedBy`/`lastEditedBy`를 참고한 값으로, 인증 주체를 법적 의미로 증명하는 필드는 아닙니다.

## 일일 운영데이터 백업

- 매일 04:10(Asia/Seoul)에 Firestore 운영 컬렉션과 견적 메시지를 JSON으로 직렬화한 뒤 gzip 압축합니다.
- 백업 위치는 Firebase Storage의 `_system_backups/YYYY-MM-DD/operations-*.json.gz` 입니다.
- Storage Rules의 최종 관리자 전용 규칙에 의해 일반 사용자/비회원은 접근할 수 없습니다.
- 백업 파일은 30일 보관 후 자동 정리합니다.
- 백업 성공/실패는 `system_backup_runs`에 기록합니다.

## 복구 절차

1. Firebase/Google Cloud 관리자 권한으로 `_system_backups/`에서 원하는 gzip 파일을 내려받습니다.
2. 압축을 풀고 `collections`와 `messages`의 `path` 값을 기준으로 복구 대상을 검토합니다.
3. 운영 Firestore에 바로 덮어쓰지 말고 별도 테스트 프로젝트에서 먼저 import/검증합니다.
4. 정상 여부 확인 후 필요한 문서만 선별 복구합니다.

## 배포 전제

Cloud Functions 신규/변경 배포에는 프로젝트 서비스 계정의 적절한 IAM 권한이 필요합니다. 저장소 CI가 성공해도 Functions가 실제 프로젝트에 배포되지 않았다면 예약 정리·감사로그·백업은 실행되지 않습니다.
