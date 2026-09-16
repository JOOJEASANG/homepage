// 견적 항목/내지 섹션 HTML 템플릿 전용 모듈
// 마크업은 기존 quote-book.js에서 그대로 이동하며 계산/이벤트 로직은 포함하지 않습니다.

export function renderQuoteItemTemplate({ quoteItemCounter, designPrice, oshiPrice }) {
    return `
            <div class="quote-item-header">
                <h3 class="text-lg font-bold text-slate-800 flex items-center gap-2">
                    <span class="w-6 h-6 rounded-full bg-brand-100 text-brand-600 text-xs flex items-center justify-center">${quoteItemCounter}</span>
                    견적 항목
                </h3>
                <button type="button" class="remove-quote-item-btn text-red-400 hover:text-red-600 transition-colors p-2 ${quoteItemCounter === 1 ? 'hidden' : ''}" title="삭제"><i class="fas fa-trash-alt"></i></button>
            </div>

            <div class="mb-8">
                <h2 class="text-sm font-bold text-brand-600 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-pen-nib"></i> 기본 정보
                </h2>
                <div class="bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <label class="block text-xs font-bold text-slate-500 mb-1">제작물 제목 (품명)</label>
                    <input type="text" name="orderName" class="form-input w-full orderName font-medium" placeholder="예: 2025년 상반기 자료집" required>
                </div>
            </div>

            <div class="mb-8">
                <h2 class="text-sm font-bold text-brand-600 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-book-open"></i> 표지 설정
                </h2>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-lg border border-slate-100">
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">표지 용지 <button type="button" class="ml-1 text-[10px] text-blue-700 underline cover-paper-preview-btn">📘 미리보기</button></label>
                        <select name="coverPaperType" class="form-select w-full coverPaperType"></select>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">표지 인쇄</label>
                        <select name="coverPrintType" class="form-select w-full coverPrintType">
                            <option value="none">인쇄 안함</option>
                            <option value="color_simplex" selected>컬러 단면</option>
                            <option value="color_duplex">컬러 양면</option>
                        </select>
                    </div>
                    <div class="md:col-span-2 pt-2 flex flex-wrap gap-4 border-t border-slate-200 mt-2">
                        <label class="flex items-center cursor-pointer gap-2">
                            <input type="checkbox" name="coverDesign" class="coverDesign rounded text-brand-600 focus:ring-brand-500">
                            <span class="text-sm text-slate-700">표지 디자인 의뢰 (+${designPrice.toLocaleString()}원)</span>
                        </label>
                        <label class="flex items-center cursor-pointer gap-2">
                            <input type="checkbox" name="coverOshi" class="coverOshi rounded text-brand-600 focus:ring-brand-500">
                            <span class="text-sm text-slate-700">표지 오시 1줄 (+${oshiPrice.toLocaleString()}원/부)</span>
                        </label>
                    </div>
                </div>
            </div>

            <div class="mb-8">
                <h2 class="text-sm font-bold text-brand-600 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-file-alt"></i> 내지 설정
                </h2>
                <div class="space-y-3 inner-sections-container"></div>
                <div class="mt-3 grid grid-cols-2 gap-3">
                    <button type="button" class="add-inner-section-btn py-2 px-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        <i class="fas fa-plus text-xs mr-1"></i> 내지 추가
                    </button>
                    <button type="button" class="add-interleaf-btn py-2 px-3 border border-slate-300 rounded-lg text-sm font-bold text-slate-600 hover:bg-slate-50 transition-colors">
                        <i class="fas fa-palette text-xs mr-1"></i> 색지(간지) 추가
                    </button>
                </div>
                
                <div class="interleaf-section mt-4 bg-orange-50 border border-orange-100 p-4 rounded-lg hidden">
                    <h3 class="text-sm font-bold text-orange-800 mb-3">🎨 간지(색지) 설정</h3>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">간지 색상 (90g)</label>
                            <select name="interleafColor" class="form-select w-full interleafColor">
                                <option value="sky">하늘색</option>
                                <option value="green">연두색</option>
                                <option value="pink">분홍색</option>
                                <option value="yellow">노란색</option>
                            </select>
                        </div>
                        <div>
                            <label class="block text-xs font-bold text-slate-500 mb-1">간지 수량 (페이지)</label>
                            <input type="number" name="interleafSheets" value="0" min="0" class="form-input w-full interleafSheets">
                        </div>
                        <div class="md:col-span-2">
                            <label class="flex items-center gap-2 cursor-pointer">
                                <input type="checkbox" name="includeInterleaf" class="includeInterleaf rounded text-brand-600 focus:ring-brand-500">
                                <span class="text-sm text-slate-700">전체 페이지 수에 간지 포함 (내지 페이지에서 차감)</span>
                            </label>
                        </div>
                    </div>
                </div>
            </div>

            <div class="mb-8">
                <h2 class="text-sm font-bold text-brand-600 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-cogs"></i> 제본 및 수량
                </h2>
                <div class="space-y-4">
                     <div>
                        <label class="block text-xs font-bold text-slate-500 mb-2">제본 방식</label>
                        <input type="hidden" name="bindingType" class="bindingType" value="none">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 binding-options">
                            <button type="button" class="option-card" data-value="perfect">
                                <div class="relative w-12 h-12 mb-2 rounded overflow-hidden border border-slate-100">
                                    <img class="binding-preview-thumb w-full h-full object-cover" data-binding-key="perfect" alt="무선 제본">
                                </div>
                                <span class="title">무선 제본</span>
                                <span class="description">책자 형태</span>
                            </button>
                            <button type="button" class="option-card" data-value="wire">
                                <div class="relative w-12 h-12 mb-2 rounded overflow-hidden border border-slate-100">
                                    <img class="binding-preview-thumb w-full h-full object-cover" data-binding-key="wire" alt="와이어 제본">
                                </div>
                                <span class="title">와이어 제본</span>
                                <span class="description">스프링 방식</span>
                            </button>
                            <button type="button" class="option-card" data-value="saddle">
                                <div class="relative w-12 h-12 mb-2 rounded overflow-hidden border border-slate-100">
                                    <img class="binding-preview-thumb w-full h-full object-cover" data-binding-key="saddle" alt="중철 제본">
                                </div>
                                <span class="title">중철 제본</span>
                                <span class="description">스테이플러</span>
                            </button>
                            <button type="button" class="option-card selected" data-value="none">
                                <div class="w-12 h-12 mb-2 rounded bg-slate-100 flex items-center justify-center text-slate-400">
                                    <i class="fas fa-file text-xl m-0"></i>
                                </div>
                                <span class="title">제본 안함</span>
                                <span class="description">낱장 인쇄</span>
                            </button>
                        </div>
                    </div>
                    <div class="binding-direction-section hidden">
                        <label class="block text-xs font-bold text-slate-500 mb-2">제본 방향 / 철 위치</label>
                        <input type="hidden" name="bindingDirection" class="bindingDirection" value="portrait-left">
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 binding-direction-options">
                            <button type="button" class="option-card selected" data-value="portrait-left">
                                <div class="w-10 h-14 mb-2 bg-white border border-slate-300 rounded-sm relative shadow-sm">
                                    <div class="absolute top-1 bottom-1 left-0 border-l-[3px] border-slate-700"></div>
                                    <div class="absolute top-2 bottom-2 left-2 border-l border-dashed border-slate-200"></div>
                                </div>
                                <span class="title">세로좌철</span>
                                <span class="description">세로 · 왼쪽 제본</span>
                            </button>
                            <button type="button" class="option-card" data-value="portrait-top">
                                <div class="w-10 h-14 mb-2 bg-white border border-slate-300 rounded-sm relative shadow-sm">
                                    <div class="absolute left-1 right-1 top-0 border-t-[3px] border-slate-700"></div>
                                    <div class="absolute left-2 right-2 top-2 border-t border-dashed border-slate-200"></div>
                                </div>
                                <span class="title">세로상철</span>
                                <span class="description">세로 · 위쪽 제본</span>
                            </button>
                            <button type="button" class="option-card" data-value="landscape-top">
                                <div class="w-14 h-10 mb-2 bg-white border border-slate-300 rounded-sm relative shadow-sm">
                                    <div class="absolute left-1 right-1 top-0 border-t-[3px] border-slate-700"></div>
                                    <div class="absolute left-2 right-2 top-2 border-t border-dashed border-slate-200"></div>
                                </div>
                                <span class="title">가로상철</span>
                                <span class="description">가로 · 위쪽 제본</span>
                            </button>
                            <button type="button" class="option-card" data-value="landscape-left">
                                <div class="w-14 h-10 mb-2 bg-white border border-slate-300 rounded-sm relative shadow-sm">
                                    <div class="absolute top-1 bottom-1 left-0 border-l-[3px] border-slate-700"></div>
                                    <div class="absolute top-2 bottom-2 left-2 border-l border-dashed border-slate-200"></div>
                                </div>
                                <span class="title">가로좌철</span>
                                <span class="description">가로 · 왼쪽 제본</span>
                            </button>
                        </div>
                    </div>
                    <div>
                        <label class="block text-xs font-bold text-slate-500 mb-1">주문 수량 (부)</label>
                        <input type="number" name="quantity" value="1" min="1" class="form-input w-full quantity text-lg font-bold text-brand-700">
                    </div>
                </div>
            </div>
            
             <div>
                <h2 class="text-sm font-bold text-brand-600 mb-3 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-comment-dots"></i> 비고 (요청사항)
                </h2>
                <textarea name="remarks" rows="2" class="form-textarea w-full remarks resize-none" placeholder="특별히 요청하실 내용이 있다면 적어주세요."></textarea>
            </div>`;
}

export function renderInnerSectionTemplate({ sectionCount }) {
    return `
            ${sectionCount > 0 ? `<button type="button" class="remove-inner-section-btn absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-200 text-slate-500 hover:bg-red-100 hover:text-red-500 flex items-center justify-center transition-colors" title="삭제"><i class="fas fa-times text-xs"></i></button>` : ''}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">규격 (사이즈) 단위(mm)</label>
                    <select name="paperSize" class="form-select w-full paperSize">
                        <option value="1" selected>A4 (210×297)</option>
                        <option value="0.9">B5 (182×257)</option>
                        <option value="1.8">B4 (257×364)</option>
                        <option value="2">A3 (297×420)</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">내지 용지 <button type="button" class="ml-1 text-[10px] text-emerald-700 underline inner-paper-preview-btn">📄 미리보기</button></label>
                    <select name="innerPaperType" class="form-select w-full innerPaperType"></select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">내지 인쇄</label>
                    <select name="innerPrintType" class="form-select w-full innerPrintType">
                        <option value="bw_simplex">흑백 단면</option>
                        <option value="bw_duplex" selected>흑백 양면</option>
                        <option value="color_simplex">컬러 단면</option>
                        <option value="color_duplex">컬러 양면</option>
                    </select>
                </div>
                <div>
                    <label class="block text-xs font-bold text-slate-500 mb-1">페이지 수</label>
                    <input name="innerPages" type="number" value="50" min="1" class="form-input w-full innerPages">
                </div>
            </div>`;
}
