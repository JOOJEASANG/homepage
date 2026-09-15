from pathlib import Path

PATH = Path('assets/js/pages/quote-book.js')
text = PATH.read_text(encoding='utf-8')

ALREADY_APPLIED = (
    'import { getWireCoverCost, getWireInnerPricingMultiplier, getWireBindingMetrics, isWireBindingAllowed } from "./quote-book/wire-calculator.js";' in text
    and "bindingType === 'wire'\n                        ? getWireBindingMetrics" in text
)

if ALREADY_APPLIED:
    print('wire refactor already applied; no changes')
    raise SystemExit(0)


def replace_once(label: str, old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)
    print(f'{label}: patched')


replace_once(
    'import wire calculator',
    'import { getPerfectInnerPricingMultiplier, getPerfectBindingMetrics } from "./quote-book/perfect-calculator.js";\nimport "../session.js";',
    'import { getPerfectInnerPricingMultiplier, getPerfectBindingMetrics } from "./quote-book/perfect-calculator.js";\nimport { getWireCoverCost, getWireInnerPricingMultiplier, getWireBindingMetrics, isWireBindingAllowed } from "./quote-book/wire-calculator.js";\nimport "../session.js";',
)

replace_once(
    'route wire page limit to module',
    "if (wireOption) wireOption.classList.toggle('disabled', totalInnerPages > 450);",
    "if (wireOption) wireOption.classList.toggle('disabled', !isWireBindingAllowed(totalInnerPages));",
)

replace_once(
    'route wire cover cost to module',
    "if (itemEl.querySelector('.bindingType').value === 'wire') totalCoverCost /= 2;",
    "if (selectedBindingType === 'wire') totalCoverCost = getWireCoverCost(totalCoverCost);",
)

replace_once(
    'route wire inner multiplier to module',
    """                const sizeMultiplier = selectedBindingType === 'perfect'
          ? getPerfectInnerPricingMultiplier({ sectionSizeValue, normalSizeMultiplier, isColorPrint })
          : (sectionSizeValue === 'a5'
              ? (selectedBindingType === 'wire' ? 0.70 : normalSizeMultiplier)
              : (sectionSizeValue === '0.9' && isColorPrint ? 1 : normalSizeMultiplier));""",
    """                const sizeMultiplier = selectedBindingType === 'perfect'
          ? getPerfectInnerPricingMultiplier({ sectionSizeValue, normalSizeMultiplier, isColorPrint })
          : (selectedBindingType === 'wire'
              ? getWireInnerPricingMultiplier({ sectionSizeValue, normalSizeMultiplier, isColorPrint })
              : (sectionSizeValue === '0.9' && isColorPrint ? 1 : normalSizeMultiplier));""",
)

replace_once(
    'route wire binding metrics to module',
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
""",
    """            if (bindingType !== 'none') {
                const bindingMetrics = bindingType === 'perfect'
                    ? getPerfectBindingMetrics({
                        totalInnerPagesSpecified,
                        interleafSheets,
                        includeInterleafInTotal,
                        itemSizeMultiplier,
                    })
                    : (bindingType === 'wire'
                        ? getWireBindingMetrics({
                            totalInnerPagesSpecified,
                            interleafSheets,
                            includeInterleafInTotal,
                            itemSizeMultiplier,
                        })
                        : null);
                const actualTotalPages = bindingMetrics
                    ? bindingMetrics.actualTotalPages
                    : (includeInterleafInTotal
                        ? totalInnerPagesSpecified
                        : (totalInnerPagesSpecified + interleafSheets));
                const bindingSizeMultiplier = bindingMetrics
                    ? bindingMetrics.sizeMultiplier
                    : largeSizeMultiplier;
""",
)

PATH.write_text(text, encoding='utf-8')
print('wire refactor applied successfully')
