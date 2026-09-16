// 책자 견적 폼 DOM → 저장 데이터 직렬화
// draft와 Firestore 제출은 기존 코드의 간지 0장 처리 차이를 그대로 유지합니다.

function readCommonQuoteItem(itemEl) {
    return {
        orderName: itemEl.querySelector('.orderName').value,
        coverPaperType: itemEl.querySelector('.coverPaperType').value,
        coverPrintType: itemEl.querySelector('.coverPrintType').value,
        coverDesign: itemEl.querySelector('.coverDesign').checked,
        coverOshi: itemEl.querySelector('.coverOshi').checked,
        bindingType: itemEl.querySelector('.bindingType').value,
        bindingDirection: itemEl.querySelector('.bindingDirection')?.value || 'portrait-left',
        quantity: itemEl.querySelector('.quantity').value,
        remarks: itemEl.querySelector('.remarks').value,
    };
}

function readInnerSections(itemEl) {
    const sections = [];
    itemEl.querySelectorAll('.inner-section').forEach(section => {
        sections.push({
            paperSize: section.querySelector('.paperSize').value,
            innerPaperType: section.querySelector('.innerPaperType').value,
            innerPrintType: section.querySelector('.innerPrintType').value,
            innerPages: section.querySelector('.innerPages').value,
        });
    });
    return sections;
}

/** 임시저장용: 간지 영역이 보이면 0장이어도 색상/포함 여부를 보존합니다. */
export function serializeDraftQuoteItem(itemEl) {
    const itemData = readCommonQuoteItem(itemEl);
    const interleafSection = itemEl.querySelector('.interleaf-section');

    if (!interleafSection.classList.contains('hidden')) {
        itemData.interleafColor = interleafSection.querySelector('.interleafColor').value;
        itemData.interleafSheets = interleafSection.querySelector('.interleafSheets').value;
        itemData.includeInterleaf = interleafSection.querySelector('.includeInterleaf').checked;
    } else {
        itemData.interleafSheets = 0;
    }

    itemData.innerSections = readInnerSections(itemEl);
    return itemData;
}

/** Firestore 제출용: 기존 코드처럼 간지가 0장이면 색상/포함 필드를 생략합니다. */
export function serializeSubmissionQuoteItem(itemEl) {
    const itemData = readCommonQuoteItem(itemEl);
    const interleafSection = itemEl.querySelector('.interleaf-section');
    itemData.interleafSheets = interleafSection.classList.contains('hidden')
        ? 0
        : (itemEl.querySelector('.interleafSheets').value || 0);

    if (itemData.interleafSheets > 0) {
        itemData.interleafColor = itemEl.querySelector('.interleafColor').value;
        itemData.includeInterleaf = itemEl.querySelector('.includeInterleaf').checked;
    }

    itemData.innerSections = readInnerSections(itemEl);
    return itemData;
}

export function serializeQuoteItems(itemElements, mode = 'draft') {
    const serializer = mode === 'submission'
        ? serializeSubmissionQuoteItem
        : serializeDraftQuoteItem;
    return Array.from(itemElements || []).map(serializer);
}
