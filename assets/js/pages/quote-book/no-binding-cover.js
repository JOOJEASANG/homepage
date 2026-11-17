// 제본 안함이면 표지 재료·인쇄·후가공을 견적에서 제외합니다.
export function syncNoBindingCoverState(itemEl) {
    if (!itemEl) return;
    const isNoBinding = itemEl.querySelector('.bindingType')?.value === 'none';
    const coverPaper = itemEl.querySelector('.coverPaperType');
    const coverPrint = itemEl.querySelector('.coverPrintType');
    const coverDesign = itemEl.querySelector('.coverDesign');
    const coverOshi = itemEl.querySelector('.coverOshi');

    if (isNoBinding) {
        if (coverPaper) coverPaper.value = 'none'; // 표지없음
        if (coverPrint) coverPrint.value = 'none'; // 인쇄 안함
        if (coverDesign) coverDesign.checked = false;
        if (coverOshi) coverOshi.checked = false;
        itemEl.querySelectorAll('.wireCoverFront, .wireCoverBack').forEach(input => { input.checked = false; });
        itemEl.dataset.wireCoverFront = '0';
        itemEl.dataset.wireCoverBack = '0';
    }

    [coverPaper, coverPrint, coverDesign, coverOshi, itemEl.querySelector('.cover-paper-preview-btn')]
        .forEach(control => { if (control) control.disabled = isNoBinding; });
    itemEl.querySelector('[data-order-stage="cover"]')?.classList.toggle('opacity-60', isNoBinding);
    itemEl.querySelector('.no-binding-cover-notice')?.classList.toggle('hidden', !isNoBinding);
}
