from pathlib import Path

PATH = Path('assets/js/pages/quote-book.js')
text = PATH.read_text(encoding='utf-8')

ALREADY_APPLIED = (
    'import { getPerfectInnerPricingMultiplier, getPerfectBindingMetrics } from "./quote-book/perfect-calculator.js";' in text
    and "bindingType === 'perfect'\n                    ? getPerfectBindingMetrics" in text
)

if ALREADY_APPLIED:
    print('perfect refactor already applied; no changes')
    raise SystemExit(0)


def replace_once(label: str, old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)
    print(f'{label}: patched')


replace_once(
    'import perfect calculator',
    'import { getSaddleSectionMetrics } from "./quote-book/saddle-calculator.js";\nimport "../session.js";',
    'import { getSaddleSectionMetrics } from "./quote-book/saddle-calculator.js";\nimport { getPerfectInnerPricingMultiplier, getPerfectBindingMetrics } from "./quote-book/perfect-calculator.js";\nimport "../session.js";',
)

replace_once(
    'route perfect inner multiplier to module',
    """                const sizeMultiplier = sectionSizeValue === 'a5'
          ? ((selectedBindingType === 'perfect' || selectedBindingType === 'wire') ? 0.70 : normalSizeMultiplier)
          : (sectionSizeValue === '0.9' && isColorPrint ? 1 : normalSizeMultiplier);""",
    """                const sizeMultiplier = selectedBindingType === 'perfect'
          ? getPerfectInnerPricingMultiplier({ sectionSizeValue, normalSizeMultiplier, isColorPrint })
          : (sectionSizeValue === 'a5'
              ? (selectedBindingType === 'wire' ? 0.70 : normalSizeMultiplier)
              : (sectionSizeValue === '0.9' && isColorPrint ? 1 : normalSizeMultiplier));""",
)

replace_once(
    'route perfect binding metrics to module',
    """            if (bindingType !== 'none') {
                const actualTotalPages = includeInterleafInTotal ? 
                                         totalInnerPagesSpecified : 
                                         (totalInnerPagesSpecified + interleafSheets);

                const bindingTiers = priceConfig.binding[bindingType] || [];
                bindingUnitPrice = findBindingPriceTier(bindingTiers, quantity, actualTotalPages) * largeSizeMultiplier;
                bindingCost = Math.floor((bindingUnitPrice * quantity) / 100) * 100; // 100원 단위 절삭
""",
    """            if (bindingType !== 'none') {
                const perfectBindingMetrics = bindingType === 'perfect'
                    ? getPerfectBindingMetrics({
                        totalInnerPagesSpecified,
                        interleafSheets,
                        includeInterleafInTotal,
                        itemSizeMultiplier,
                    })
                    : null;
                const actualTotalPages = perfectBindingMetrics
                    ? perfectBindingMetrics.actualTotalPages
                    : (includeInterleafInTotal
                        ? totalInnerPagesSpecified
                        : (totalInnerPagesSpecified + interleafSheets));
                const bindingSizeMultiplier = perfectBindingMetrics
                    ? perfectBindingMetrics.sizeMultiplier
                    : largeSizeMultiplier;

                const bindingTiers = priceConfig.binding[bindingType] || [];
                bindingUnitPrice = findBindingPriceTier(bindingTiers, quantity, actualTotalPages) * bindingSizeMultiplier;
                bindingCost = Math.floor((bindingUnitPrice * quantity) / 100) * 100; // 100원 단위 절삭
""",
)

PATH.write_text(text, encoding='utf-8')
print('perfect refactor applied successfully')
