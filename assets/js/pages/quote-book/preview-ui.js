// 이미지 미리보기 모달의 DOM 렌더링 전용 모듈

export function openImagePreview(title, url) {
        // 하위 호환: 단일 URL 미리보기
        openPreviewLayer({
            title: title || '미리보기',
            selectedUrl: url || '',
            items: url ? [{ key: 'single', label: title || '미리보기', url }] : [],
            emptyText: '등록된 이미지가 없습니다.',
            categoryKey: null,
            categoryLabel: null
        });
    }

export function openPreviewLayer({ title, selectedUrl, items = [], emptyText = '등록된 이미지가 없습니다.', categoryKey = null, categoryLabel = null } = {}) {
        const modal = document.getElementById('image-preview-modal');
        const img = document.getElementById('image-preview-img');
        const t = document.getElementById('image-preview-title');
        const msg = document.getElementById('image-preview-message');
        const thumbs = document.getElementById('image-preview-thumbs');
        const count = document.getElementById('image-preview-count');
        const badge = document.getElementById('image-preview-badge');

        if (!modal || !img || !t || !msg || !thumbs) return;

        // 제목/배지
        t.textContent = title || '미리보기';
        if (badge) {
            badge.className = 'hidden text-[11px] px-2 py-1 rounded-full font-extrabold border';
            badge.textContent = '';
            if (categoryKey) {
                const map = {
                    coverPaper: { text: '표지', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
                    innerPaper: { text: '내지', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
                    binding: { text: '제본', cls: 'bg-violet-50 text-violet-700 border-violet-200' },
                };
                const info = map[categoryKey] || { text: (categoryLabel || '구분'), cls: 'bg-slate-50 text-slate-700 border-slate-200' };
                badge.textContent = categoryLabel || info.text;
                badge.classList.remove('hidden');
                badge.classList.add(...info.cls.split(' '));
            }
        }
        if (modal) {
            modal.dataset.category = categoryKey || '';
        }

        // 메시지 / 메인이미지
        const hasMain = !!selectedUrl;
        if (hasMain) {
            img.src = selectedUrl;
            img.classList.remove('hidden');
            msg.classList.add('hidden');
            msg.textContent = '';
        } else {
            img.src = '';
            img.classList.add('hidden');
            msg.textContent = emptyText;
            msg.classList.remove('hidden');
        }

        // 썸네일(등록된 것만)
        thumbs.innerHTML = '';
        const safeItems = (items || []).filter(it => it && it.url);
        if (count) count.textContent = safeItems.length ? `${safeItems.length}개` : '';

        if (safeItems.length === 0) {
            // 등록된 이미지가 하나도 없으면 안내만
            if (!hasMain) {
                msg.textContent = emptyText;
                msg.classList.remove('hidden');
            }
        } else {
            for (const it of safeItems) {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'group bg-white rounded-xl overflow-hidden border border-slate-100 shadow-sm hover:shadow transition flex flex-col w-[calc((100%-24px)/3)] max-w-[220px]';
                btn.innerHTML = `
                    <div class="aspect-[4/3] bg-slate-50 overflow-hidden">
                        <img src="${it.url}" alt="${(it.label||it.key||'').replace(/"/g,'&quot;')}" class="w-full h-full object-cover group-hover:scale-[1.02] transition">
                    </div>
                    <div class="p-2 text-xs text-slate-600 truncate">${(it.label || it.key || '').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</div>
                `;
                btn.addEventListener('click', () => {
                    img.src = it.url;
                    img.classList.remove('hidden');
                    msg.classList.add('hidden');
                    msg.textContent = '';
                });
                thumbs.appendChild(btn);
            }
        }

        modal.classList.remove('hidden');
        modal.classList.add('flex');
    }

export function closeImagePreview() {
        const modal = document.getElementById('image-preview-modal');
        const img = document.getElementById('image-preview-img');
        const msg = document.getElementById('image-preview-message');
        const thumbs = document.getElementById('image-preview-thumbs');
        const count = document.getElementById('image-preview-count');

        if (img) img.src = '';
        if (msg) { msg.textContent = ''; msg.classList.add('hidden'); }
        if (thumbs) thumbs.innerHTML = '';
        if (count) count.textContent = '';

        modal?.classList.add('hidden');
        modal?.classList.remove('flex');
    }
