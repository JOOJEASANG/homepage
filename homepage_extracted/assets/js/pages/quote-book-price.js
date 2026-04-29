import { app, auth, db, storage, doc, setDoc, getDoc, onAuthStateChanged, setPersistence, browserLocalPersistence } from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";
document.addEventListener("DOMContentLoaded", ()=>initHeader("book"));

await setPersistence(auth, browserLocalPersistence);
let unitPriceConfig = {};
        
        onAuthStateChanged(auth, async (user) => { try { window.__currentFirebaseUser = user; } catch(e) {}
            const pageContent = document.getElementById('page-content');
            if (user) {
                try {
                    const userDocRef = doc(db, "users", user.uid);
                    const userDocSnap = await getDoc(userDocRef);

                    if (userDocSnap.exists() && userDocSnap.data().role === 'admin') {
                        initializeAppPage();
                    } else {
                        renderAccessDenied();
                    }
                } catch(e) {
                    renderAccessDenied();
                }
            } else {
                // 로그인 안되어있으면 창 닫기 혹은 로그인 안내
                 renderAccessDenied("로그인이 필요합니다.");
                 // 팝업인 경우 보통 window.close() 하거나 메인으로 보냄
            }
        });

        function renderAccessDenied(msg = "이 페이지는 관리자만 접근할 수 있습니다.") {
            const pageContent = document.getElementById('page-content');
            pageContent.innerHTML = `
                <div class="w-full h-full flex flex-col items-center justify-center p-8 text-center absolute inset-0 z-10 bg-white">
                    <div class="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4 text-red-500">
                        <i class="fas fa-lock text-2xl"></i>
                    </div>
                    <h1 class="text-xl font-bold text-slate-800">접근이 거부되었습니다</h1>
                    <p class="text-slate-500 mt-2 text-sm">${msg}</p>
                </div>`;
        }

        function sanitizeHTML(str) {
            if (!str) return '';
            const map = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };
            return str.replace(/[&<>"']/g, (m) => map[m]);
        }
        
        function showToast(message, type = 'info') {
            const toastContainer = document.getElementById('toast-container');
            const toast = document.createElement('div');
            // 스타일 업데이트 (그린 오피스 테마)
            const colors = { success: 'bg-brand-600', error: 'bg-red-500', info: 'bg-blue-500' };
            const icons = { success: 'fa-check-circle', error: 'fa-exclamation-circle', info: 'fa-info-circle' };
            
            toast.className = `${colors[type]} text-white px-6 py-3 rounded-full shadow-lg flex items-center gap-3 transform translate-x-full transition-all duration-300 z-[9999]`;
            toast.innerHTML = `<i class="fas ${icons[type]}"></i><span class="font-bold text-sm">${sanitizeHTML(message)}</span>`;
            
            toastContainer.appendChild(toast);
            requestAnimationFrame(() => toast.classList.remove('translate-x-full'));
            setTimeout(() => {
                toast.classList.add('translate-x-full', 'opacity-0');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }

        // Firestore settings/imagePreviews._meta.items 에서 용지 종류가 늘어나면
        // 단가관리/견적서에서 동일하게 반영되도록 meta 라벨을 우선 사용합니다.
        let baseInnerPapers = [
            { value: 'mimoon80', text: '미색모조 80g' }, { value: 'mimoon100', text: '미색모조 100g' },
            { value: 'baek80', text: '백색모조 80g' }, { value: 'baek100', text: '백색모조 100g' },
        ];
        let premiumInnerPapers = [
            { value: 'snow120', text: '스노우지 120g' }, { value: 'snow150', text: '스노우지 150g' },
        ];
        let coverPapers = [
            { v:'snow200', t:'스노우지 (200g)' },
            { v:'snow250', t:'스노우지 (250g)' },
            { v:'arte190', t:'고급지아르떼 (190g)' }
        ];

        const inferInnerGroup = (key) => {
            const premiumKeys = new Set(['snow120','snow150']);
            return premiumKeys.has(key) ? 'premium' : 'general';
        };

        async function loadPaperMeta() {
            try {
                const snap = await getDoc(doc(db, 'settings', 'imagePreviews'));
                const data = snap.exists() ? (snap.data() || {}) : {};
                const items = data?._meta?.items || {};
                const cover = Array.isArray(items.coverPaper) ? items.coverPaper : [];
                const inner = Array.isArray(items.innerPaper) ? items.innerPaper : [];

                if (cover.length) {
                    const uniq = new Set();
                    const list = [];
                    cover.forEach(it => {
                        if (!it || !it.key) return;
                        if (it.key === 'none') return; // 단가 cover는 none 제외
                        if (uniq.has(it.key)) return;
                        uniq.add(it.key);
                        list.push({ v: it.key, t: it.text || it.label || it.key });
                    });
                    if (list.length) coverPapers = list;
                }

                if (inner.length) {
                    const g = [];
                    const p = [];
                    const seen = new Set();
                    inner.forEach(it => {
                        if (!it || !it.key) return;
                        if (seen.has(it.key)) return;
                        seen.add(it.key);
                        const label = it.text || it.label || it.key;
                        const group = (it.group || inferInnerGroup(it.key));
                        const row = { value: it.key, text: label };
                        (group === 'premium' ? p : g).push(row);
                    });
                    if (g.length) baseInnerPapers = g;
                    if (p.length) premiumInnerPapers = p;
                }
            } catch (e) {
                console.warn('용지 메타 로딩 실패(기본값 사용):', e);
            }
        }

        const getDefaultPriceConfig = () => {
             const priceTierTemplate = (isColor = false) => isColor ? 
                [{ threshold: 1, price: 200 }, { threshold: 501, price: 150 }] :
                [{ threshold: 1, price: 50 }, { threshold: 1001, price: 30 }];

            return {
                cover: {
                    "snow200_color_simplex": [{ threshold: 1, price: 1500 }], "snow200_color_duplex": [{ threshold: 1, price: 2000 }],
                    "snow250_color_simplex": [{ threshold: 1, price: 1800 }], "snow250_color_duplex": [{ threshold: 1, price: 2500 }],
                    "arte190_color_simplex": [{ threshold: 1, price: 2000 }], "arte190_color_duplex": [{ threshold: 1, price: 2800 }],
                },
                inner: {
                    base_general: {
                        "bw_simplex": priceTierTemplate(), "bw_duplex": priceTierTemplate(),
                        "color_simplex": priceTierTemplate(true), "color_duplex": priceTierTemplate(true),
                    },
                    base_premium: {
                        "bw_simplex": priceTierTemplate(), "bw_duplex": priceTierTemplate(),
                        "color_simplex": priceTierTemplate(true), "color_duplex": priceTierTemplate(true),
                    },
                    upcharges: {
                        'mimoon100': 10, 'baek80': 0, 'baek100': 10, 'snow150': 10, 
                        'snow200': 20, 'snow250': 30, 'arte190': 30
                    }
                },
                interleaf: {
                    "sky": [{ threshold: 1, price: 80 }], "green": [{ threshold: 1, price: 80 }],
                    "pink": [{ threshold: 1, price: 80 }], "yellow": [{ threshold: 1, price: 80 }],
                },
                binding: {
                    "perfect": [{ pageOperator: 'gte', pageThreshold: 1, qtyOperator: 'gte', qtyThreshold: 1, price: 2000 }],
                    "wire": [{ pageOperator: 'gte', pageThreshold: 1, qtyOperator: 'gte', qtyThreshold: 1, price: 2500 }],
                    "saddle": [{ pageOperator: 'gte', pageThreshold: 1, qtyOperator: 'gte', qtyThreshold: 1, price: 1000 }],
                },
                etc: { coverDesign: 100000, coverOshi: 100 }
            };
        };

        const isObject = (item) => item && typeof item === 'object' && !Array.isArray(item);
        
        function mergeDeep(target, ...sources) {
            if (!sources.length) return target;
            const source = sources.shift();
            if (isObject(target) && isObject(source)) {
                for (const key in source) {
                    if (isObject(source[key])) {
                        if (!target[key]) Object.assign(target, { [key]: {} });
                        mergeDeep(target[key], source[key]);
                    } else {
                        Object.assign(target, { [key]: source[key] });
                    }
                }
            }
            return mergeDeep(target, ...sources);
        }

        async function loadUnitPriceConfig() {
            const defaultConfig = getDefaultPriceConfig();
            try {
                // 용지 메타(표지/내지 종류) 먼저 로딩
                await loadPaperMeta();
                const docRef = doc(db, "settings", "unitPriceConfig");
                const docSnap = await getDoc(docRef);

                if (docSnap.exists() && docSnap.data().book) {
                    unitPriceConfig = mergeDeep({}, defaultConfig, docSnap.data().book);
                } else {
                    unitPriceConfig = defaultConfig;
                }
            } catch (e) {
                console.error("Error loading unit price config:", e);
                unitPriceConfig = defaultConfig;
                showToast('단가 정보를 불러오는 중 오류가 발생했습니다. 기본값으로 표시합니다.', 'error');
            }

            populatePriceEditor();
        }
        
        async function saveUnitPriceConfig() {
            const btn = document.getElementById('saveUnitPriceBtn');
            btn.disabled = true;
            btn.innerHTML = `<i class="fas fa-spinner fa-spin mr-2"></i>저장 중...`;

            document.querySelectorAll('.price-section-card input').forEach(input => input.classList.remove('border-red-500'));
            
            const newConfig = JSON.parse(JSON.stringify(unitPriceConfig));
            let isValid = true;

            const processCardTiers = (card) => {
                const tiers = [];
                const rows = card.querySelectorAll('.tier-row');
                const thresholdSet = new Set();
                
                rows.forEach(row => {
                    if (!isValid) return;
                    const type = card.dataset.type;
                    
                    if (type === 'binding') {
                        const pageOperator = row.querySelector('.page-operator-toggle-btn').dataset.value;
                        const qtyOperator = row.querySelector('.qty-operator-toggle-btn').dataset.value;
                        const qtyInput = row.querySelector('.qty-threshold-input');
                        const pageInput = row.querySelector('.page-threshold-input');
                        const priceInput = row.querySelector('.price-input');
                        const qtyThreshold = parseInt(qtyInput.value, 10);
                        const pageThreshold = parseInt(pageInput.value, 10);
                        const price = parseInt(priceInput.value, 10);

                        const uniqueKey = `${pageOperator}-${pageThreshold}-${qtyOperator}-${qtyThreshold}`;
                        if (thresholdSet.has(uniqueKey)) {
                            isValid = false;
                            pageInput.classList.add('border-red-500');
                            qtyInput.classList.add('border-red-500');
                        } else {
                            thresholdSet.add(uniqueKey);
                        }

                        if (isNaN(qtyThreshold) || isNaN(pageThreshold) || isNaN(price) || qtyThreshold < 1 || pageThreshold < 1 || price < 0) {
                            isValid = false;
                        } else {
                            tiers.push({ pageOperator, pageThreshold, qtyOperator, qtyThreshold, price });
                        }
                    } else {
                        const thresholdInput = row.querySelector('.threshold-input');
                        const priceInput = row.querySelector('.price-input');
                        const threshold = parseInt(thresholdInput.value, 10);
                        const price = parseInt(priceInput.value, 10);

                        if (thresholdSet.has(threshold)) {
                            isValid = false;
                            thresholdInput.classList.add('border-red-500');
                        } else {
                            thresholdSet.add(threshold);
                        }

                        if (isNaN(threshold) || isNaN(price) || threshold < 1 || price < 0) {
                            isValid = false;
                        } else {
                            tiers.push({ threshold, price });
                        }
                    }
                });
                return tiers.sort((a, b) => (b.threshold || b.pageThreshold || 0) - (a.threshold || a.pageThreshold || 0));
            };

	            document.querySelectorAll('.price-section-card').forEach(card => {
                if (!isValid) return;
                const key = card.dataset.key;
                const type = card.dataset.type;
                const tiers = processCardTiers(card);

                if (type === 'inner') {
                    const [baseKey, printKey] = [key.split('_').slice(0, 2).join('_'), key.split('_').slice(2).join('_')];
                    if (newConfig.inner[baseKey] && newConfig.inner[baseKey].hasOwnProperty(printKey)) newConfig.inner[baseKey][printKey] = tiers;
	                } else if (newConfig[type]) {
	                    // 신규(자동생성) 항목도 저장되도록: 존재 여부와 무관하게 upsert
	                    newConfig[type][key] = tiers;
                }
            });

            document.querySelectorAll('.inner-upcharge-input').forEach(input => {
                const price = parseInt(input.value, 10);
                if (isNaN(price) || price < 0) {
                    isValid = false;
                    input.classList.add('border-red-500');
                } else {
                    newConfig.inner.upcharges[input.dataset.paper] = price;
                }
            });

            const coverDesignInput = document.getElementById('etc-price-coverDesign');
            const coverOshiInput = document.getElementById('etc-price-coverOshi');
            const coverDesignPrice = parseInt(coverDesignInput.value, 10);
            const coverOshiPrice = parseInt(coverOshiInput.value, 10);
            if (isNaN(coverDesignPrice) || coverDesignPrice < 0) {
                isValid = false;
                coverDesignInput.classList.add('border-red-500');
            }
            if (isNaN(coverOshiPrice) || coverOshiPrice < 0) {
                isValid = false;
                coverOshiInput.classList.add('border-red-500');
            }
            
            if (!isValid) { 
                showToast('입력값이 유효하지 않거나 중복된 구간이 있습니다.', 'error'); 
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save mr-2"></i>단가 저장`;
                return; 
            }
            
            newConfig.etc.coverDesign = coverDesignPrice;
            newConfig.etc.coverOshi = coverOshiPrice;
            
            unitPriceConfig = newConfig;
            try {
                await setDoc(doc(db, "settings", "unitPriceConfig"), { book: unitPriceConfig }, { merge: true });
                showToast('성공적으로 저장되었습니다.', 'success');
            } catch (e) {
                console.error("Error saving unit price config: ", e);
                showToast('저장 중 오류가 발생했습니다.', 'error');
            } finally {
                btn.disabled = false;
                btn.innerHTML = `<i class="fas fa-save mr-2"></i>단가 저장`;
            }
        }

        function createPriceCardHTML(title, key, tiers, type) {
            const validTiers = Array.isArray(tiers) && tiers.length > 0 ? tiers : [{ threshold: 1, price: 0 }];
            const sortedTiers = validTiers.sort((a, b) => (b.threshold || b.pageThreshold || 0) - (a.threshold || a.pageThreshold || 0));

            let headerHtml, rowsHTML;
            if (type === 'binding') {
                headerHtml = `<div class="grid grid-cols-12 gap-x-2 text-xs font-bold text-slate-500 px-2 pb-2 border-b border-slate-100 mb-2">
                                <div class="col-span-1"></div>
                                <div class="col-span-4 text-center">페이지</div>
                                <div class="col-span-3 text-center">수량</div>
                                <div class="col-span-3 text-center">단가(원)</div>
                                <div class="col-span-1"></div>
                              </div>`;
                rowsHTML = sortedTiers.map(tier => {
                    const pageIcon = (tier.pageOperator || 'gte') === 'lte' ? 'fa-arrow-down' : 'fa-arrow-up';
                    const qtyIcon = (tier.qtyOperator || 'gte') === 'lte' ? 'fa-arrow-down' : 'fa-arrow-up';
                    return `<div class="grid grid-cols-12 gap-x-2 items-center tier-row mt-2">
                                <div class="col-span-1 drag-handle text-center text-slate-300 hover:text-slate-500"><i class="fas fa-grip-vertical"></i></div>
                                <div class="col-span-4 flex items-center gap-1">
                                    <button type="button" class="operator-toggle-btn page-operator-toggle-btn" data-value="${tier.pageOperator || 'gte'}"><i class="fas ${pageIcon}"></i></button>
                                    <input type="number" class="w-full form-input text-sm page-threshold-input text-right" value="${tier.pageThreshold || 1}" min="1">
                                </div>
                                <div class="col-span-3 flex items-center gap-1">
                                    <button type="button" class="operator-toggle-btn qty-operator-toggle-btn" data-value="${tier.qtyOperator || 'gte'}"><i class="fas ${qtyIcon}"></i></button>
                                    <input type="number" class="w-full form-input text-sm qty-threshold-input text-right" value="${tier.qtyThreshold || 1}" min="1">
                                </div>
                                <div class="col-span-3">
                                    <input type="number" class="w-full form-input text-sm price-input text-right font-bold text-slate-700" value="${tier.price}" min="0">
                                </div>
                                <div class="col-span-1 flex justify-center">
                                   <button class="icon-btn remove-tier-btn"><i class="fas fa-times"></i></button>
                                </div>
                            </div>`;
                }).join('');
            } else {
                let headerLabel = (type === 'cover') ? '수량(이상)' : (type === 'interleaf' ? '총 매수(이상)' : '페이지(이상)');
                headerHtml = `<div class="grid grid-cols-10 gap-x-2 text-xs font-bold text-slate-500 px-2 pb-2 border-b border-slate-100 mb-2">
                                <div class="col-span-1"></div>
                                <div class="col-span-4 text-center">${headerLabel}</div>
                                <div class="col-span-4 text-center">단가(원)</div>
                                <div class="col-span-1"></div>
                              </div>`;
                rowsHTML = sortedTiers.map(tier => 
                    `<div class="grid grid-cols-10 gap-x-2 items-center tier-row mt-2">
                        <div class="col-span-1 drag-handle text-center text-slate-300 hover:text-slate-500"><i class="fas fa-grip-vertical"></i></div>
                        <div class="col-span-4"><input type="number" class="w-full form-input text-sm threshold-input text-right" value="${tier.threshold || 1}" min="1"></div>
                        <div class="col-span-4"><input type="number" class="w-full form-input text-sm price-input text-right font-bold text-slate-700" value="${tier.price}" min="0"></div>
                        <div class="col-span-1 flex justify-center"><button class="icon-btn remove-tier-btn"><i class="fas fa-times"></i></button></div>
                    </div>`
                ).join('');
            }
            return `<div class="price-section-card bg-slate-50 p-4 rounded-xl border border-slate-100 flex flex-col hover:border-brand-200 transition-colors" data-key="${key}" data-type="${type}">
                        <h4 class="font-bold text-brand-700 mb-3 flex items-center gap-2"><i class="fas fa-tag text-xs opacity-50"></i> ${title}</h4>
                        <div class="flex-grow">${headerHtml}<div class="tier-rows-container">${rowsHTML}</div></div>
                        <button class="btn btn-secondary btn-sm mt-4 add-tier-btn self-start text-xs"><i class="fas fa-plus mr-1.5"></i>구간 추가</button>
                    </div>`;
        }

        function populatePriceEditor() {
            const coverSectionsEl = document.getElementById('cover-price-sections');
            const innerContentEl = document.getElementById('inner-price-content');
            const interleafSectionsEl = document.getElementById('interleaf-price-sections');
            const bindingSectionsEl = document.getElementById('binding-price-sections');
            const etcSectionsEl = document.getElementById('etc-price-sections');
            
            [coverSectionsEl, innerContentEl, interleafSectionsEl, bindingSectionsEl, etcSectionsEl].forEach(el => el.innerHTML = '');

            const createUpchargeHTML = (papers, upchargeData, title) => {
                let html = `<h4 class="text-md font-bold text-slate-800 col-span-full mt-6 border-b border-slate-200 pb-2 flex items-center gap-2"><i class="fas fa-plus-circle text-brand-500"></i> ${title}</h4><div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">`;
                papers.forEach(paper => {
                    if (paper.value !== 'mimoon80' && paper.value !== 'snow120') { // 80g 미색모조, 120g 스노우는 기준 용지
                        html += `<div class="bg-white p-3 rounded-lg border border-slate-200 shadow-sm flex items-center justify-between">
                                    <label class="text-sm font-medium text-slate-600">${paper.text}</label>
                                    <div class="flex items-center">
                                        <span class="mr-2 text-xs font-bold text-brand-600">+</span>
                                        <input type="number" class="w-24 form-input text-sm inner-upcharge-input text-right font-bold" data-paper="${paper.value}" value="${upchargeData[paper.value] || 0}" min="0">
                                        <span class="ml-1 text-xs text-slate-400">원</span>
                                    </div>
                                </div>`;
                    }
                });
                html += '</div>';
                return html;
            };

	            const coverPrints = [{v:'color_simplex',t:'컬러 단면'},{v:'color_duplex',t:'컬러 양면'}];
	            // 이미지관리에서 새로 추가된 표지 용지(메타)도 "기존 단가를 지우지 않고" 자동으로 추가되도록 처리
	            // - 메타에 있는 항목: 카드 표시 + (없으면 기본값으로 생성)
	            // - 기존에 저장돼 있던 항목(메타에 없는 키): "기존 항목" 섹션에 그대로 표시
	            const displayedCoverKeys = new Set();
	            if (!unitPriceConfig.cover) unitPriceConfig.cover = {};
	            coverPapers.forEach(p => {
	                coverPrints.forEach(i => {
	                    const key = `${p.v}_${i.v}`;
	                    displayedCoverKeys.add(key);
	                    // 자동생성: 없으면 기본 구간으로 생성(저장 시 upsert 됨)
	                    if (!Array.isArray(unitPriceConfig.cover[key])) {
	                        unitPriceConfig.cover[key] = [{ threshold: 1, price: 0 }];
	                    }
	                    const title = `${p.t} / ${i.t}`;
	                    coverSectionsEl.innerHTML += createPriceCardHTML(title, key, unitPriceConfig.cover[key], 'cover');
	                });
	            });

	            // 메타에는 없지만 기존에 저장돼 있던 표지 단가(사용자 수동 추가/예전 데이터)를 보이게 유지
	            const legacyCoverKeys = Object.keys(unitPriceConfig.cover || {}).filter(k => !displayedCoverKeys.has(k));
	            if (legacyCoverKeys.length) {
	                coverSectionsEl.innerHTML += `
	                    <h4 class="text-md font-bold text-slate-800 col-span-full mt-10 border-b border-slate-200 pb-2 flex items-center gap-2">
	                        <i class="fas fa-folder-open text-slate-400"></i> 기존 표지 단가(자동생성 외)
	                    </h4>`;
	                legacyCoverKeys.sort().forEach(k => {
	                    if (!Array.isArray(unitPriceConfig.cover[k])) unitPriceConfig.cover[k] = [{ threshold: 1, price: 0 }];
	                    coverSectionsEl.innerHTML += createPriceCardHTML(`기존 항목: ${k}`, k, unitPriceConfig.cover[k], 'cover');
	                });
	            }

            let innerHTML = '';
            const printTypes = { "bw_simplex": "흑백 단면", "bw_duplex": "흑백 양면", "color_simplex": "컬러 단면", "color_duplex": "컬러 양면" };
            innerHTML += `<h4 class="text-md font-bold text-slate-800 col-span-full border-b border-slate-200 pb-2 flex items-center gap-2"><i class="fas fa-layer-group text-brand-500"></i> 일반 용지 기준 단가 (미색모조 80g)</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">`;
            Object.entries(printTypes).forEach(([printKey, printTitle]) => {
                innerHTML += createPriceCardHTML(printTitle, `base_general_${printKey}`, unitPriceConfig.inner.base_general[printKey], 'inner');
            });
            innerHTML += '</div>' + createUpchargeHTML(baseInnerPapers, unitPriceConfig.inner.upcharges, '일반 용지 추가금 설정 (페이지당)');
            
            innerHTML += `<h4 class="text-md font-bold text-slate-800 col-span-full mt-12 border-b border-slate-200 pb-2 flex items-center gap-2"><i class="fas fa-layer-group text-brand-500"></i> 고급 용지 기준 단가 (스노우지 120g)</h4><div class="grid grid-cols-1 md:grid-cols-2 gap-6 mt-4">`;
            Object.entries(printTypes).forEach(([printKey, printTitle]) => {
                innerHTML += createPriceCardHTML(printTitle, `base_premium_${printKey}`, unitPriceConfig.inner.base_premium[printKey], 'inner');
            });
            innerHTML += '</div>' + createUpchargeHTML(premiumInnerPapers, unitPriceConfig.inner.upcharges, '고급 용지 추가금 설정 (페이지당)');
            innerContentEl.innerHTML = innerHTML;

            Object.entries({ "sky": "하늘색", "green": "연두색", "pink": "분홍색", "yellow": "노란색" }).forEach(([key, title]) => {
                interleafSectionsEl.innerHTML += createPriceCardHTML(title, key, unitPriceConfig.interleaf[key], 'interleaf');
            });

            Object.entries({ "perfect": "무선 제본", "wire": "와이어 제본", "saddle": "중철 제본" }).forEach(([key, title]) => {
                bindingSectionsEl.innerHTML += createPriceCardHTML(title, key, unitPriceConfig.binding[key], 'binding');
            });
            
            etcSectionsEl.innerHTML = `
                <div class="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <label for="etc-price-coverDesign" class="block text-sm font-bold text-slate-700 mb-2">표지 디자인 (고정 금액)</label>
                    <div class="relative">
                        <input type="number" id="etc-price-coverDesign" class="w-full form-input font-bold text-slate-800" value="${unitPriceConfig.etc.coverDesign || 0}" min="0">
                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
                    </div>
                </div>
                <div class="bg-slate-50 p-5 rounded-xl border border-slate-200">
                    <label for="etc-price-coverOshi" class="block text-sm font-bold text-slate-700 mb-2">표지 오시 (부당 금액)</label>
                    <div class="relative">
                        <input type="number" id="etc-price-coverOshi" class="w-full form-input font-bold text-slate-800" value="${unitPriceConfig.etc.coverOshi || 0}" min="0">
                        <span class="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">원</span>
                    </div>
                </div>
            `;

            document.querySelectorAll('.tier-rows-container').forEach(el => {
                new Sortable(el, { animation: 150, handle: '.drag-handle', ghostClass: 'sortable-ghost' });
            });
        }
        
        function setupEventListeners() {
            const pageContent = document.getElementById('page-content');
            pageContent.addEventListener('click', e => {
                const tabButton = e.target.closest('.tab-btn');
                if (tabButton) {
                    pageContent.querySelectorAll('.tab-btn').forEach(tab => tab.classList.remove('active'));
                    tabButton.classList.add('active');
                    const panelId = tabButton.id.replace('tab', 'panel');
                    pageContent.querySelectorAll('[id^="price-panel-"]').forEach(p => p.classList.add('hidden'));
                    document.getElementById(panelId)?.classList.remove('hidden');
                }

                const toggleBtn = e.target.closest('.operator-toggle-btn');
                if (toggleBtn) {
                    const currentValue = toggleBtn.dataset.value;
                    const newValue = currentValue === 'gte' ? 'lte' : 'gte';
                    const newIcon = newValue === 'lte' ? 'fa-arrow-down' : 'fa-arrow-up';
                    toggleBtn.dataset.value = newValue;
                    toggleBtn.querySelector('i').className = `fas ${newIcon}`;
                }
                
                if (e.target.closest('.add-tier-btn')) {
                    const card = e.target.closest('.price-section-card');
                    const container = card.querySelector('.tier-rows-container');
                    const newRow = document.createElement('div');
                    const cardType = card.dataset.type;

                    if (cardType === 'binding') {
                        newRow.className = 'grid grid-cols-12 gap-x-2 items-center tier-row mt-2';
                        newRow.innerHTML = `<div class="col-span-1 drag-handle text-center text-slate-300 hover:text-slate-500"><i class="fas fa-grip-vertical"></i></div>
                                            <div class="col-span-4 flex items-center gap-1">
                                                <button type="button" class="operator-toggle-btn page-operator-toggle-btn" data-value="gte"><i class="fas fa-arrow-up"></i></button>
                                                <input type="number" class="w-full form-input text-sm page-threshold-input text-right" value="1" min="1">
                                            </div>
                                            <div class="col-span-3 flex items-center gap-1">
                                                <button type="button" class="operator-toggle-btn qty-operator-toggle-btn" data-value="gte"><i class="fas fa-arrow-up"></i></button>
                                                <input type="number" class="w-full form-input text-sm qty-threshold-input text-right" value="1" min="1">
                                            </div>
                                            <div class="col-span-3">
                                                <input type="number" class="w-full form-input text-sm price-input text-right font-bold text-slate-700" value="0" min="0">
                                            </div>
                                            <div class="col-span-1 flex justify-center">
                                                <button class="icon-btn remove-tier-btn"><i class="fas fa-times"></i></button>
                                            </div>`;
                    } else {
                        newRow.className = 'grid grid-cols-10 gap-x-2 items-center tier-row mt-2';
                        newRow.innerHTML = `<div class="col-span-1 drag-handle text-center text-slate-300 hover:text-slate-500"><i class="fas fa-grip-vertical"></i></div>
                                            <div class="col-span-4"><input type="number" class="w-full form-input text-sm threshold-input text-right" value="1" min="1"></div>
                                            <div class="col-span-4"><input type="number" class="w-full form-input text-sm price-input text-right font-bold text-slate-700" value="0" min="0"></div>
                                            <div class="col-span-1 flex justify-center"><button class="icon-btn remove-tier-btn"><i class="fas fa-times"></i></button></div>`;
                    }
                    container.appendChild(newRow);
                }
                
                if (e.target.closest('.remove-tier-btn')) {
                    e.target.closest('.tier-row').remove();
                }

                if(e.target.closest('#saveUnitPriceBtn')) {
                    saveUnitPriceConfig();
                }

                if(e.target.closest('#close-btn')) {
                    window.close();
                }
            });
        }
            // 닫기 버튼 제거 및 레이아웃 정리
        async function initializeAppPage() {
            document.getElementById('page-content').innerHTML = `
                <div class="flex items-center mb-6 pb-4 border-b border-slate-200 flex-shrink-0">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 rounded-lg bg-brand-100 flex items-center justify-center text-brand-600">
                            <i class="fas fa-calculator text-xl"></i>
                        </div>
                        <div>
                            <h1 class="text-xl font-bold text-slate-800">책/보고서 단가 관리</h1>
                            <p class="text-xs text-slate-500">자동 견적 시스템에 적용될 단가를 설정합니다.</p>
                        </div>
                    </div>
                    </div>
                
                <div class="flex border-b border-slate-200 mb-6 flex-shrink-0 gap-6 px-2">
                    <button id="price-tab-cover" class="tab-btn active">표지</button>
                    <button id="price-tab-inner" class="tab-btn">내지</button>
                    <button id="price-tab-interleaf" class="tab-btn">간지</button>
                    <button id="price-tab-binding" class="tab-btn">제본</button>
                    <button id="price-tab-etc" class="tab-btn">기타</button>
                </div>

                <div class="flex-grow overflow-y-auto pr-2 -mr-2 custom-scrollbar">
                    <div id="price-panel-cover">
                        <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
                            <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                            <div>
                                <p class="text-sm text-blue-800 font-bold mb-1">표지 단가 설정 안내</p>
                                <p class="text-xs text-blue-600">표지 종류 및 인쇄 방식에 따라, <strong class="underline">주문 수량(부)</strong>을 기준으로 단가를 설정합니다. (단위: 원/부)</p>
                            </div>
                        </div>
                        <div id="cover-price-sections" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-2 gap-6"></div>
                    </div>
                    
                    <div id="price-panel-inner" class="hidden">
                        <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
                             <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                            <div>
                                <p class="text-sm text-blue-800 font-bold mb-1">내지 단가 설정 안내</p>
                                <p class="text-xs text-blue-600"><strong class="underline">A4 사이즈를 기준</strong>으로 내지 단가를 설정합니다. 다른 사이즈는 A4 단가에 따라 자동 계산됩니다. (B5: 0.9배, B4: 1.8배, A3: 2배)</p>
                            </div>
                        </div>
                        <div id="inner-price-content" class="space-y-8"></div>
                    </div>
                    
                    <div id="price-panel-interleaf" class="hidden">
                        <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
                             <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                            <div>
                                <p class="text-sm text-blue-800 font-bold mb-1">간지 단가 설정 안내</p>
                                <p class="text-xs text-blue-600">간지 종류에 따라, <strong class="underline">총 간지 매수(간지 페이지수 × 수량)</strong>를 기준으로 단가를 설정합니다. (단위: 원/장)</p>
                            </div>
                        </div>
                        <div id="interleaf-price-sections" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
                    </div>
                    
                    <div id="price-panel-binding" class="hidden">
                        <div class="bg-blue-50 border border-blue-100 p-4 rounded-lg mb-6 flex items-start gap-3">
                             <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                            <div>
                                <p class="text-sm text-blue-800 font-bold mb-1">제본 단가 설정 안내</p>
                                <p class="text-xs text-blue-600">제본 방식에 따라, <strong class="underline">페이지 수와 주문 수량(부)</strong>을 기준으로 단가를 설정합니다. (단위: 원/부)</p>
                            </div>
                        </div>
                        <div id="binding-price-sections" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
                    </div>
                    
                    <div id="price-panel-etc" class="hidden">
                         <p class="text-sm text-slate-500 mb-4 font-bold">기타 추가 옵션에 대한 단가를 설정합니다.</p>
                         <div id="etc-price-sections" class="grid grid-cols-1 md:grid-cols-2 gap-6"></div>
                    </div>
                </div>
                
                <div class="mt-6 flex justify-end flex-shrink-0 pt-6 border-t border-slate-200">
                    <button id="saveUnitPriceBtn" class="btn btn-success px-6 py-3 text-sm shadow-md">
                        <i class="fas fa-save mr-2"></i>변경사항 저장
                    </button>
                </div>`;

            try {
                await loadUnitPriceConfig();
                setupEventListeners();
            } catch (error) {
                console.error("Initialization failed:", error);
                showToast("페이지 초기화에 실패했습니다. 데이터베이스 연결을 확인해주세요.", "error");
            }
        }
