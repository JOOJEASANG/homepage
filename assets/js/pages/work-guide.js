import { app, auth, db, storage, getApps, getApp, onAuthStateChanged, collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, writeBatch, ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject } from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";
import { sanitizeRichText } from "../rich-text-sanitizer.js";
import { getGuideDetail, renderGuideDetails } from "./work-guide/guide-details.js";

// If opened inside a header layer (iframe), don't render the fixed header.
const __WG_WORKSPACE__ = document.body.dataset.page === 'admin';
const __WG_EMBED__ = (()=>{
  try { return ['1', 'admin'].includes(new URLSearchParams(location.search).get('embed')); } catch(e) { return false; }
})();

function initializeWorkGuidePage() {
  setupGuideSearch();
  if (__WG_WORKSPACE__) {
    setTimeout(() => loadGuides(), 0);
    return;
  }
  if (!__WG_EMBED__) initHeader("guide");
  // Direct navigation and embedded navigation both display the guide.
  setTimeout(() => window.openWorkGuideModal?.(), 0);
}
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initializeWorkGuidePage, { once: true });
} else initializeWorkGuidePage();

// [수정] listAll, deleteObject 추가 (이미지 삭제용)
    
    let guides = [];
    let guideSearchTerm = '';
    let guideCategoryFilter = '전체';

    function guideCategory(guide) {
        return String(guide.category || getGuideDetail(guide.title)?.category || '기타').trim();
    }

    function filteredGuides() {
        const search = guideSearchTerm.toLocaleLowerCase('ko').trim();
        return guides.filter(guide => {
            if (guideCategoryFilter !== '전체' && guideCategory(guide) !== guideCategoryFilter) return false;
            if (!search) return true;
            const target = [guide.title, guideCategory(guide), guide.content || '', getGuideDetail(guide.title)?.summary || ''].join(' ').toLocaleLowerCase('ko');
            return target.includes(search);
        });
    }

    function setupGuideSearch() {
        const input = document.getElementById('guideSearch');
        if (input && !input.dataset.wgSearchBound) {
            input.dataset.wgSearchBound = '1';
            input.addEventListener('input', () => {
                guideSearchTerm = input.value;
                renderSidebar();
            });
        }
    }
    let currentGuideId = null;
    let isAdmin = false;
    let sortableInstance = null; 
    let Sortable = window.Sortable;
    if (!Sortable) {
        // A sorting CDN failure must not block authentication, viewing or editing.
        import('https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js')
            .then(module => { Sortable = module.default; if (isAdmin) renderSidebar(); })
            .catch(error => console.warn('Guide sorting unavailable:', error));
    }

    function applyInlineStyleToSelection(styleObj) {
        const sel = window.getSelection();
        if (!sel || sel.rangeCount === 0) return;
        const range = sel.getRangeAt(0);
        if (!range) return;
        const span = document.createElement('span');
        Object.entries(styleObj || {}).forEach(([k, v]) => span.style.setProperty(k, v));
        if (range.collapsed) {
            span.appendChild(document.createTextNode('\u200B'));
            range.insertNode(span);
            const newRange = document.createRange();
            newRange.setStart(span.firstChild, 1);
            newRange.collapse(true);
            sel.removeAllRanges();
            sel.addRange(newRange);
        } else {
            span.appendChild(range.extractContents());
            range.insertNode(span);
            sel.removeAllRanges();
            const newRange = document.createRange();
            newRange.selectNodeContents(span);
            newRange.collapse(false);
            sel.addRange(newRange);
        }
    }

    function getGuideEditorEls() {
        return {
            editor: document.getElementById('wg-content-editor'),
            sizeSel: document.getElementById('wg-font-size'),
            clearBtn: document.getElementById('wg-clear-format-btn'),
            imgBtn: document.getElementById('wg-insert-image-btn'),
            urlBtn: document.getElementById('wg-insert-url-btn'),
            imgInput: document.getElementById('wg-image-input'),
        };
    }

    function setupGuideEditor() {
        const { editor, sizeSel, clearBtn, imgBtn, urlBtn, imgInput } = getGuideEditorEls();
        if (!editor) return;

        const btns = document.querySelectorAll('.wg-editor-btn');
        btns.forEach(btn => {
            const newBtn = btn.cloneNode(true);
            btn.parentNode.replaceChild(newBtn, btn);
            newBtn.addEventListener('click', (e) => {
                e.preventDefault();
                editor.focus();
                const cmd = newBtn.dataset.cmd;
                const align = newBtn.dataset.align;
                const list = newBtn.dataset.list;
                try {
                    if (cmd) document.execCommand(cmd, false, null);
                    else if (align) {
                        if (align === 'left') document.execCommand('justifyLeft', false, null);
                        if (align === 'center') document.execCommand('justifyCenter', false, null);
                        if (align === 'right') document.execCommand('justifyRight', false, null);
                    } else if (list) {
                        if (list === 'ul') document.execCommand('insertUnorderedList', false, null);
                        if (list === 'ol') document.execCommand('insertOrderedList', false, null);
                    }
                } catch(e) {}
            });
        });

        if(sizeSel) {
            const newSizeSel = sizeSel.cloneNode(true);
            sizeSel.parentNode.replaceChild(newSizeSel, sizeSel);
            newSizeSel.addEventListener('change', () => {
                const px = parseInt(newSizeSel.value || '14', 10);
                if (!px) return;
                editor.focus();
                applyInlineStyleToSelection({ 'font-size': px + 'px' });
            });
        }

        if(clearBtn) {
            const newClearBtn = clearBtn.cloneNode(true);
            clearBtn.parentNode.replaceChild(newClearBtn, clearBtn);
            newClearBtn.addEventListener('click', () => {
                editor.innerHTML = (editor.innerText || '').replace(/\n/g, '<br>');
                editor.focus();
            });
        }

        if(urlBtn) {
            const newUrlBtn = urlBtn.cloneNode(true);
            urlBtn.parentNode.replaceChild(newUrlBtn, urlBtn);
            newUrlBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const url = prompt("이미지 주소(URL)를 입력하세요:");
                if(url) {
                    editor.focus();
                    document.execCommand('insertImage', false, url);
                }
            });
        }

        if(imgBtn && imgInput) {
            const newImgBtn = imgBtn.cloneNode(true);
            imgBtn.parentNode.replaceChild(newImgBtn, imgBtn);
            const newImgInput = imgInput.cloneNode(true);
            imgInput.parentNode.replaceChild(newImgInput, imgInput);
            
            newImgBtn.addEventListener('click', (e) => { e.preventDefault(); newImgInput.click(); });
            newImgInput.addEventListener('change', async () => {
                const file = newImgInput.files?.[0];
                if (!file) return;
                const originalText = newImgBtn.innerHTML;
                newImgBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
                newImgBtn.disabled = true;
                try {
                    const gid = document.getElementById('editGuideId')?.value || 'temp';
                    const ts = Date.now();
                    const safeName = (file.name || 'image').replace(/[^a-z0-9._-]/gi, '_');
                    const path = `work_guides/${gid}/images/${ts}_${safeName}`;
                    const r = storageRef(storage, path);
                    await uploadBytes(r, file);
                    const url = await getDownloadURL(r);
                    editor.focus();
                    document.execCommand('insertImage', false, url);
                } catch (e) {
                    console.error(e);
                    alert('이미지 업로드 오류');
                } finally {
                    newImgInput.value = '';
                    newImgBtn.innerHTML = originalText;
                    newImgBtn.disabled = false;
                }
            });
        }
    }

    window.showContent = function() {
        if(window.innerWidth < 768) {
            document.getElementById('sidebarArea').classList.add('hidden');
            const ca = document.getElementById('contentArea');
            ca.classList.remove('hidden');
            ca.classList.add('flex');
        }
    };

    window.showSidebar = function() {
        if(window.innerWidth < 768) {
            const ca = document.getElementById('contentArea');
            ca.classList.add('hidden');
            ca.classList.remove('flex');
            document.getElementById('sidebarArea').classList.remove('hidden');
        }
    };

    window.openWorkGuideModal = function() {
        const modal = document.getElementById('workGuideModal');
        if(modal) {
            modal.classList.remove('hidden');
            modal.classList.add('flex');
            loadGuides();
        }
    };

    window.closeWorkGuideModal = function() {
        const modal = document.getElementById('workGuideModal');
        if(modal) {
            modal.classList.add('hidden');
            modal.classList.remove('flex');
            window.cancelEdit();
            window.showSidebar();
        }

        // If this page is embedded in the header layer, also ask parent to close the layer.
        if (new URLSearchParams(location.search).get('embed') === '1') {
            try { window.parent?.postMessage({ type: 'CLOSE_WORK_GUIDE' }, location.origin); } catch(e) {}
        }
    };

    async function loadGuides() {
        try {
            const q = query(collection(db, 'work_guides'), orderBy('createdAt', 'desc'));
            const snap = await getDocs(q);
            
            guides = snap.docs.map(d => {
                const data = d.data();
                return { 
                    id: d.id, 
                    ...data, 
                    order: (data.order === undefined || data.order === null) ? 999999 : data.order 
                };
            });
            
            guides.sort((a, b) => a.order - b.order);

            renderSidebar();
            if (currentGuideId && guides.some(guide => guide.id === currentGuideId)) {
                window.selectGuide(currentGuideId);
            }
            if (window.innerWidth >= 768 && guides.length > 0 && !currentGuideId) {
                window.selectGuide(guides[0].id);
            }
        } catch (e) {
            console.error("Load guides error:", e);
            alert('데이터 로딩 중 오류가 발생했습니다.');
        }
    }

    function renderSidebar() {
        const guideListEl = document.getElementById('guideList');
        if (!guideListEl) return;
        if (sortableInstance) { sortableInstance.destroy(); sortableInstance = null; }

        const categoryEl = document.getElementById('guideFilters');
        const available = ['전체', ...new Set(guides.map(guideCategory))];
        if (!available.includes(guideCategoryFilter)) guideCategoryFilter = '전체';
        if (categoryEl) {
            categoryEl.replaceChildren();
            available.forEach(category => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'wg-filter-btn';
                btn.textContent = category;
                btn.setAttribute('aria-pressed', String(category === guideCategoryFilter));
                btn.addEventListener('click', () => {
                    guideCategoryFilter = category;
                    renderSidebar();
                });
                categoryEl.appendChild(btn);
            });
        }

        const visible = filteredGuides();
        const countEl = document.getElementById('guideResultCount');
        if (countEl) countEl.textContent = `${visible.length} / ${guides.length}개`;
        guideListEl.replaceChildren();
        if (visible.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'wg-no-results';
            empty.textContent = guides.length ? '검색 결과가 없습니다. 검색어나 분야를 변경해 주세요.' : '등록된 작업가이드가 없습니다.';
            guideListEl.appendChild(empty);
            return;
        }

        visible.forEach((guide) => {
            const row = document.createElement('div');
            row.className = 'wg-guide-item' + (guide.id === currentGuideId ? ' is-active' : '');
            row.dataset.id = guide.id;
            row.tabIndex = 0;
            row.setAttribute('role', 'button');
            row.setAttribute('aria-current', guide.id === currentGuideId ? 'true' : 'false');
            row.setAttribute('aria-label', guide.title || '작업가이드');

            const number = document.createElement('span');
            number.className = 'wg-item-number';
            number.textContent = String(guides.indexOf(guide) + 1).padStart(2, '0');
            const copy = document.createElement('span');
            copy.className = 'wg-item-copy';
            const title = document.createElement('span');
            title.className = 'wg-item-title';
            title.textContent = guide.title || '';
            const category = document.createElement('span');
            category.className = 'wg-item-category';
            category.textContent = guideCategory(guide);
            copy.append(title, category);
            if (isAdmin && !guideSearchTerm.trim() && guideCategoryFilter === '전체') {
                const handle = document.createElement('span');
                handle.className = 'handle cursor-grab text-slate-300 hover:text-slate-600';
                handle.title = '순서 이동';
                handle.innerHTML = '<i class="fas fa-grip-vertical" aria-hidden="true"></i>';
                row.appendChild(handle);
            }
            row.append(number, copy);
            const pick = event => {
                if (event.type === 'click' && event.target.closest('.handle')) return;
                if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
                if (event.type === 'keydown') event.preventDefault();
                window.selectGuide(guide.id);
            };
            row.addEventListener('click', pick);
            row.addEventListener('keydown', pick);
            guideListEl.appendChild(row);
        });

        // 필터 중에는 일부 항목만 저장되는 정렬 사고를 방지합니다.
        if (isAdmin && Sortable && !guideSearchTerm.trim() && guideCategoryFilter === '전체') {
            sortableInstance = new Sortable(guideListEl, {
                animation: 160,
                handle: '.handle',
                ghostClass: 'bg-indigo-50',
                onEnd: async () => {
                    const newOrderIds = Array.from(guideListEl.children).map(el => el.dataset.id);
                    const idMap = new Map(guides.map(guide => [guide.id, guide]));
                    guides = newOrderIds.map(id => idMap.get(id)).filter(Boolean);
                    await saveOrder();
                },
            });
        }
    }

    async function saveOrder() {
        const listItems = document.querySelectorAll('#guideList > div');
        if (listItems.length === 0) return;

        const batch = writeBatch(db);
        let count = 0;

        listItems.forEach((item, index) => {
            const id = item.getAttribute('data-id');
            if (!id) return;
            const docRef = doc(db, 'work_guides', id);
            batch.update(docRef, { order: Number(index + 1) });
            count++;
        });

        if (count === 0) return;
        try {
            await batch.commit();
        } catch (e) {
            console.error("Order save error:", e);
        }
    }

    function renderGuideNavigation() {
        const visible = filteredGuides();
        const index = visible.findIndex(guide => guide.id === currentGuideId);
        const controls = [
            [document.getElementById('guidePrev'), index > 0 ? visible[index - 1] : null, '← 이전'],
            [document.getElementById('guideNext'), index >= 0 && index < visible.length - 1 ? visible[index + 1] : null, '다음 →'],
        ];
        controls.forEach(([button, guide, prefix]) => {
            if (!button) return;
            button.disabled = !guide;
            button.textContent = guide ? `${prefix} · ${guide.title}` : prefix;
            button.onclick = guide ? () => window.selectGuide(guide.id) : null;
        });
    }

    window.selectGuide = function(id) {
        currentGuideId = id;
        renderSidebar();
        const guide = guides.find(item => item.id === id);
        if (!guide) return;

        document.getElementById('guideViewer').classList.remove('hidden');
        document.getElementById('guideEditor').classList.add('hidden');
        document.getElementById('guideEditor').classList.remove('flex');

        document.getElementById('viewTitle').textContent = guide.title || '작업가이드';
        document.getElementById('mobileHeaderTitle').textContent = guide.title || '내용 보기';
        const detail = getGuideDetail(guide.title);
        const categoryEl = document.getElementById('viewCategory');
        if (categoryEl) categoryEl.textContent = guideCategory(guide);
        const summary = document.getElementById('viewSummary');
        if (summary) summary.textContent = detail?.summary || (guide.content || '').trim().slice(0, 180) || '출력·제본 작업에 필요한 내용을 확인하세요.';
        const pageIndex = document.getElementById('viewIndex');
        if (pageIndex) pageIndex.textContent = `${guides.indexOf(guide) + 1} / ${guides.length}`;

        const viewContent = document.getElementById('viewContent');
        if (guide.contentHtml) viewContent.innerHTML = sanitizeRichText(guide.contentHtml);
        else viewContent.textContent = guide.content || '등록된 내용이 없습니다.';
        // 기존 데이터는 그대로 보존하고, v3 미만 기본가이드에 실무 예시를 더합니다.
        if (detail && Number(guide.guideVersion || 0) < 3) {
            viewContent.insertAdjacentHTML('beforeend', renderGuideDetails(guide.title));
        }
        viewContent.scrollTop = 0;
        renderGuideNavigation();

        const adminActions = document.getElementById('adminContentAction');
        if (adminActions) adminActions.classList.toggle('hidden', !isAdmin);
        window.showContent();
    };

    window.openGuideEditor = function() {
        setupGuideEditor();
        document.getElementById('editGuideId').value = "";
        document.getElementById('editTitle').value = "";
        document.getElementById('wg-content-editor').innerHTML = "";
        document.getElementById('guideViewer').classList.add('hidden');
        const editorSec = document.getElementById('guideEditor');
        editorSec.classList.remove('hidden');
        editorSec.classList.add('flex');
        window.showContent();
    };

    window.editCurrentGuide = function() {
        setupGuideEditor();
        const g = guides.find(x => x.id === currentGuideId);
        if(!g) return;
        document.getElementById('editGuideId').value = g.id;
        document.getElementById('editTitle').value = g.title;
        const editor = document.getElementById('wg-content-editor');
        if(g.contentHtml) editor.innerHTML = sanitizeRichText(g.contentHtml);
        else editor.innerText = g.content || '';
        if (getGuideDetail(g.title) && Number(g.guideVersion || 0) < 3) {
            editor.insertAdjacentHTML('beforeend', renderGuideDetails(g.title));
        }
        document.getElementById('guideViewer').classList.add('hidden');
        const editorSec = document.getElementById('guideEditor');
        editorSec.classList.remove('hidden');
        editorSec.classList.add('flex');
    };

    window.cancelEdit = function() {
        document.getElementById('guideViewer').classList.remove('hidden');
        const editorSec = document.getElementById('guideEditor');
        editorSec.classList.add('hidden');
        editorSec.classList.remove('flex');
        if (currentGuideId) window.selectGuide(currentGuideId);
        else window.showSidebar();
    };

    window.saveGuide = async function() {
        if(!isAdmin) return alert('관리자 권한이 필요합니다.');
        const id = document.getElementById('editGuideId').value;
        const title = document.getElementById('editTitle').value.trim();
        const editor = document.getElementById('wg-content-editor');
        const contentHtml = sanitizeRichText(editor.innerHTML);
        const contentText = editor.innerText;

        if (!title) return alert('제목을 입력해주세요.');

        try {
            const data = {
                title,
                content: contentText,
                contentHtml: contentHtml,
                guideVersion: 3,
                updatedAt: serverTimestamp()
            };

            if (id) {
                await updateDoc(doc(db, 'work_guides', id), data);
            } else {
                const maxOrder = guides.reduce((max, g) => Math.max(max, g.order || 0), 0);
                data.order = maxOrder + 1;
                data.createdAt = serverTimestamp();
                
                const docRef = await addDoc(collection(db, 'work_guides'), data);
                currentGuideId = docRef.id;
            }
            await loadGuides();
            window.cancelEdit();
        } catch (e) {
            console.error(e);
            alert('저장 실패');
        }
    };

    // [수정] 스토리지 이미지까지 삭제하는 로직 추가
    window.deleteCurrentGuide = async function() {
        if(!isAdmin) return alert('관리자 권한이 필요합니다.');
        if (!confirm('삭제하시겠습니까? (첨부된 이미지도 모두 삭제됩니다)')) return;
        
        try {
            // 1. Storage 이미지 폴더 비우기 (best-effort)
            try {
                // 해당 가이드의 이미지 폴더 경로
                const folderRef = storageRef(storage, `work_guides/${currentGuideId}/images`);
                const listResult = await listAll(folderRef);
                
                // 폴더 내 모든 파일 삭제 요청
                const deletePromises = listResult.items.map(itemRef => deleteObject(itemRef));
                await Promise.all(deletePromises);
            } catch (storageErr) {
                // 이미지가 없거나 폴더가 없는 경우 에러 무시
                console.warn('이미지 삭제 중 경고(무시가능):', storageErr);
            }

            // 2. Firestore 문서 삭제
            await deleteDoc(doc(db, 'work_guides', currentGuideId));
            
            currentGuideId = null;
            await loadGuides();
            window.showSidebar();
        } catch (e) {
            console.error('Delete guide failed:', e);
            alert('삭제 실패');
        }
    };

    const closeM = document.getElementById('closeGuideMobile');
    if(closeM) closeM.onclick = window.closeWorkGuideModal;
    const closeD = document.getElementById('closeGuideDesktop');
    if(closeD) closeD.onclick = window.closeWorkGuideModal;
    
    const modal = document.getElementById('workGuideModal');
    if(modal && !__WG_WORKSPACE__) {
        modal.onclick = (e) => { 
            if(e.target === modal) window.closeWorkGuideModal(); 
        };
    }

    onAuthStateChanged(auth, async (user) => {
        const adminSidebarAction = document.getElementById('adminSidebarAction');
        if (user) {
            try {
                const snap = await getDoc(doc(db, 'users', user.uid));
                if (snap.exists() && snap.data().role === 'admin') {
                    isAdmin = true;
                    if(adminSidebarAction) adminSidebarAction.classList.remove('hidden');
                }
            } catch(e) { console.warn(e); }
        } else {
            isAdmin = false;
            if(adminSidebarAction) adminSidebarAction.classList.add('hidden');
        }
        if(guides.length > 0) renderSidebar();
    });
