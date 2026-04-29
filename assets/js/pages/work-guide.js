import { app, auth, db, storage, getApps, getApp, onAuthStateChanged, collection, addDoc, getDocs, query, orderBy, doc, updateDoc, deleteDoc, serverTimestamp, getDoc, writeBatch, ref as storageRef, uploadBytes, getDownloadURL, listAll, deleteObject } from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";

// If opened inside a header layer (iframe), don't render the fixed header.
const __WG_EMBED__ = (()=>{
  try { return new URLSearchParams(location.search).get('embed') === '1'; } catch(e) { return false; }
})();

document.addEventListener("DOMContentLoaded", ()=>{
  if (!__WG_EMBED__) initHeader("guide");
  // In embed mode, open the modal immediately (page has only modal markup)
  if (__WG_EMBED__) {
    // slight delay so DOM nodes exist
    setTimeout(()=>{ try { window.openWorkGuideModal?.(); } catch(e) {} }, 0);
  }
});

// [수정] listAll, deleteObject 추가 (이미지 삭제용)
    
    import Sortable from 'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/modular/sortable.esm.js';

    let guides = [];
    let currentGuideId = null;
    let isAdmin = false;
    let sortableInstance = null; 

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
        if (__WG_EMBED__) {
            try { window.parent?.postMessage({ type: 'CLOSE_WORK_GUIDE' }, '*'); } catch(e) {}
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
        if(!guideListEl) return;
        
        guideListEl.innerHTML = ''; 
        
        guides.forEach((g) => {
            const isActive = g.id === currentGuideId;
            const div = document.createElement('div');
            
            const baseClass = "w-full py-3.5 px-5 cursor-pointer border-b border-slate-100 transition-colors flex items-center justify-between group select-none bg-white";
            const stateClass = isActive 
                ? "border-l-4 border-l-brand-600 text-brand-900 bg-slate-50" 
                : "border-l-4 border-l-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50";

            div.className = `${baseClass} ${stateClass}`;
            div.setAttribute('data-id', g.id);
            
            div.onclick = (e) => {
                if(e.target.closest('.handle')) return;
                window.selectGuide(g.id);
            };

            div.innerHTML = `
                <div class="flex items-center gap-3 overflow-hidden w-full pointer-events-none">
                    ${isAdmin ? '<div class="handle pointer-events-auto cursor-grab px-1 text-slate-300 hover:text-slate-600"><i class="fas fa-grip-vertical"></i></div>' : ''}
                    <span class="text-[14px] font-semibold truncate flex-1">
                        ${g.title}
                    </span>
                </div>
                ${isActive ? '<i class="fas fa-chevron-right text-xs text-brand-600 shrink-0 ml-2"></i>' : ''}
            `;
            guideListEl.appendChild(div);
        });

        if (isAdmin) {
            if (sortableInstance) sortableInstance.destroy();
            
            sortableInstance = new Sortable(guideListEl, {
                animation: 150,
                handle: '.handle',
                ghostClass: 'bg-indigo-50',
                onEnd: async function (evt) {
                    const newOrderIds = Array.from(guideListEl.children).map(el => el.getAttribute('data-id'));
                    
                    const idMap = new Map(guides.map(g => [g.id, g]));
                    guides = newOrderIds.map(id => idMap.get(id)).filter(g => g);

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

    window.selectGuide = function(id) {
        currentGuideId = id;
        renderSidebar();
        
        const g = guides.find(x => x.id === id);
        if (!g) return;

        document.getElementById('guideViewer').classList.remove('hidden');
        document.getElementById('guideEditor').classList.add('hidden');
        document.getElementById('guideEditor').classList.remove('flex');
        
        document.getElementById('viewTitle').textContent = g.title;
        document.getElementById('mobileHeaderTitle').textContent = g.title;
        
        const viewContent = document.getElementById('viewContent');
        if (g.contentHtml) viewContent.innerHTML = g.contentHtml;
        else viewContent.textContent = g.content || '';

        const adminActions = document.getElementById('adminContentAction');
        if(adminActions) {
            if (isAdmin) adminActions.classList.remove('hidden');
            else adminActions.classList.add('hidden');
        }
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
        if(g.contentHtml) editor.innerHTML = g.contentHtml;
        else editor.innerText = g.content || '';
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
        const contentHtml = editor.innerHTML;
        const contentText = editor.innerText;

        if (!title) return alert('제목을 입력해주세요.');

        try {
            const data = {
                title,
                content: contentText,
                contentHtml: contentHtml,
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
    if(modal) {
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
