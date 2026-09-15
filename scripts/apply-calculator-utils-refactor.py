from pathlib import Path

PATH = Path('assets/js/pages/quote-book.js')
text = PATH.read_text(encoding='utf-8')

IMPORT_LINE = 'import { findPriceTier, findBindingPriceTier, floorToHundred, getLargeSizeMultiplier } from "./quote-book/calculator-utils.js";'
ALREADY_APPLIED = (
    IMPORT_LINE in text
    and 'function findPriceTier(' not in text
    and 'function findBindingPriceTier(' not in text
    and 'const largeSizeMultiplier = getLargeSizeMultiplier(itemSizeMultiplier);' in text
    and 'const sectionCost = floorToHundred(sectionCostRaw);' in text
)

if ALREADY_APPLIED:
    print('calculator utils refactor already applied; no changes')
    raise SystemExit(0)


def replace_once(label: str, old: str, new: str) -> None:
    global text
    count = text.count(old)
    if count != 1:
        raise SystemExit(f'{label}: expected exactly 1 match, found {count}')
    text = text.replace(old, new, 1)
    print(f'{label}: patched')


replace_once(
    'import common calculator utils',
    'import { getWireCoverCost, getWireInnerPricingMultiplier, getWireBindingMetrics, isWireBindingAllowed } from "./quote-book/wire-calculator.js";\nimport "../session.js";',
    'import { getWireCoverCost, getWireInnerPricingMultiplier, getWireBindingMetrics, isWireBindingAllowed } from "./quote-book/wire-calculator.js";\n'
    + IMPORT_LINE + '\nimport "../session.js";',
)

replace_once(
    'remove local price tier helpers',
    """    function findPriceTier(tiers = [], value) {
        if (!Array.isArray(tiers) || tiers.length === 0) return 0;
        const sortedTiers = [...tiers].sort((a, b) => b.threshold - a.threshold);
        for (const tier of sortedTiers) {
            if (value >= tier.threshold) return tier.price;
        }
        return tiers.length > 0 ? tiers[tiers.length - 1].price : 0;
    }

    function findBindingPriceTier(tiers = [], quantity, totalPages) {
        if (!Array.isArray(tiers) || tiers.length === 0) return 0;
        const sortedTiers = [...tiers].sort((a, b) => (a.pageThreshold !== b.pageThreshold) ? a.pageThreshold - b.pageThreshold : b.qtyThreshold - a.qtyThreshold);
        for (const tier of sortedTiers) {
            const pageCondition = tier.pageOperator === 'lte' ? totalPages <= tier.pageThreshold : totalPages >= tier.pageThreshold;
            const qtyCondition = tier.qtyOperator === 'gte' ? quantity >= tier.qtyThreshold : quantity <= tier.qtyThreshold;
            if (pageCondition && qtyCondition) return tier.price;
        }
        return 0;
    }
""",
    '',
)

replace_once(
    'route large size multiplier to utils',
    '            const largeSizeMultiplier = itemSizeMultiplier >= 1 ? itemSizeMultiplier : 1;',
    '            const largeSizeMultiplier = getLargeSizeMultiplier(itemSizeMultiplier);',
)

replacements = [
    (
        'cover cost rounding',
        '                totalCoverCost = Math.floor(totalCoverCost / 100) * 100; // 100원 단위 절삭',
        '                totalCoverCost = floorToHundred(totalCoverCost); // 100원 단위 절삭',
    ),
    (
        'inner section rounding',
        '                const sectionCost = Math.floor(sectionCostRaw / 100) * 100; // 100원 단위 절삭',
        '                const sectionCost = floorToHundred(sectionCostRaw); // 100원 단위 절삭',
    ),
    (
        'interleaf rounding',
        '                totalInterleafCost = Math.floor((interleafUnitPrice * totalInterleafSheets) / 100) * 100; // 100원 단위 절삭',
        '                totalInterleafCost = floorToHundred(interleafUnitPrice * totalInterleafSheets); // 100원 단위 절삭',
    ),
    (
        'binding rounding',
        '                bindingCost = Math.floor((bindingUnitPrice * quantity) / 100) * 100; // 100원 단위 절삭',
        '                bindingCost = floorToHundred(bindingUnitPrice * quantity); // 100원 단위 절삭',
    ),
    (
        'design rounding',
        '                etcDesignCost = Math.floor((priceConfig.etc.coverDesign || 0) / 100) * 100; // 100원 단위 절삭',
        '                etcDesignCost = floorToHundred(priceConfig.etc.coverDesign || 0); // 100원 단위 절삭',
    ),
    (
        'oshi rounding',
        '                etcOshiCost = Math.floor(((priceConfig.etc.coverOshi || 0) * quantity) / 100) * 100; // 100원 단위 절삭',
        '                etcOshiCost = floorToHundred((priceConfig.etc.coverOshi || 0) * quantity); // 100원 단위 절삭',
    ),
]

for label, old, new in replacements:
    replace_once(label, old, new)

PATH.write_text(text, encoding='utf-8')
print('calculator utils refactor applied successfully')
