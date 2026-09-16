# 운영 보안 및 백업 기준

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
