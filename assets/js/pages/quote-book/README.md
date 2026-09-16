# Quote Book Calculator Modules

`quote-book.js`의 견적 계산 규칙을 제본 방식별로 분리한 모듈 모음입니다.

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
