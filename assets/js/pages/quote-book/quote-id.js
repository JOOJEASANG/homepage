// 책자 견적 접수번호 생성
// 기존 quote-book.js의 Q+날짜+시간+랜덤 형식을 그대로 유지합니다.
export async function generateBookReceiptNo() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    const ymd = `${y}${m}${da}`;
    const t = String(Date.now()).slice(-6);
    const r = String(Math.floor(Math.random() * 900) + 100);
    return `Q${ymd}-${t}${r}`;
}
