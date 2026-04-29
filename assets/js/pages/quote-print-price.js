import {app, auth, db, storage, doc, getDoc, setDoc, onAuthStateChanged, setPersistence, browserLocalPersistence, ref as storageRef, uploadBytes, getDownloadURL} from "../firebase.js";
import { initHeader } from "../header.js";
import "../session.js";
document.addEventListener("DOMContentLoaded", ()=>initHeader("print"));

await setPersistence(auth, browserLocalPersistence);
const THRESHOLDS_DEFAULT = [10, 50, 100, 200, 500];

  const DEFAULTS = {
    digital_print: {
      output_base: {
        snow_200: THRESHOLDS_DEFAULT.map(t=>({ threshold:t, price: 0 })),
        arte_200: THRESHOLDS_DEFAULT.map(t=>({ threshold:t, price: 0 }))
      },
      weight_factor: {
        
        snow_120: 0.85,snow_150: 0.92, snow_180: 0.97, snow_200: 1.00, snow_220: 1.06, snow_250: 1.12,
        arte_180: 0.95, arte_200: 1.00, arte_210: 1.05, arte_250: 1.15
      },
      size: {
        minMultiplier: 0.60,
        multipliers: { A3:2.00, A4:1.00, A5:0.60, B5:0.72 }
      },
      oshi: { oneLine: 50, twoLine: 80, threeLine: 0 }
    }
  };

  const el = {
    saveBtn: document.getElementById('saveBtn'),
    reloadBtn: document.getElementById('reloadBtn'),
    addTierBtn: document.getElementById('addTierBtn'),
    adminWarn: document.getElementById('adminWarn'),
    snowBaseWrap: document.getElementById('snowBaseWrap'),
    arteBaseWrap: document.getElementById('arteBaseWrap'),
    snowFactorWrap: document.getElementById('snowFactorWrap'),
    arteFactorWrap: document.getElementById('arteFactorWrap'),
    mulA3: document.getElementById('mulA3'),
    mulA4: document.getElementById('mulA4'),
    mulA5: document.getElementById('mulA5'),
    mulB5: document.getElementById('mulB5'),
    minMul: document.getElementById('minMul'),
    oshiOne: document.getElementById('oshiOne'),
    oshiTwo: document.getElementById('oshiTwo'),
    oshiThree: document.getElementById('oshiThree'),
     guidePreview: document.getElementById('guidePreview'),
    guideEditorWrap: document.getElementById('guideEditorWrap'),
    guideEditor: document.getElementById('wg-content-editor'),
    saveGuideBtn: document.getElementById('saveGuideBtn'),
    guideRewriteBtn: document.getElementById('guideRewriteBtn'),
    guideLoadSavedBtn: document.getElementById('guideLoadSavedBtn'),
    guideTempSaveBtn: document.getElementById('guideTempSaveBtn'),
    guideEditHint: document.getElementById('guideEditHint'),
  };

  const GUIDE_DRAFT_KEY = 'printGuideDraftHtml';
  const GUIDE_DRAFT_AT_KEY = 'printGuideDraftAt';

  
  function isAdminEditMode(){
    try{
      const p = new URLSearchParams(location.search || "");
      return p.get("adminEdit") === "1";
    }catch(e){ return false; }
  }

function deepMerge(base, patch){
    const out = Array.isArray(base) ? [...base] : {...base};
    for (const k in patch){
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base?.[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], patch[k]);
      } else {
        out[k] = patch[k];
      }
    }
    return out;
  }

  function normalizeUnifiedTiers(base){
    const snowMap = new Map((base?.snow_200||[]).map(t=>[Number(t.threshold||0), Number(t.price||0)]));
    const arteMap = new Map((base?.arte_200||[]).map(t=>[Number(t.threshold||0), Number(t.price||0)]));

    let thresholds = Array.from(new Set([...snowMap.keys(), ...arteMap.keys()]))
      .map(Number)
      .filter(n=>Number.isFinite(n) && n>0)
      .sort((a,b)=>a-b);

    if (thresholds.length === 0) thresholds = [...THRESHOLDS_DEFAULT];

    return thresholds.map(th=>({
      threshold: th,
      snow: snowMap.get(th) ?? 0,
      arte: arteMap.get(th) ?? 0
    }));
  }

  // (호환용) 기존 형태 [{threshold, price}]를 그대로 정규화
  function normalizeTiers(tiers){
    const map = new Map();
    (tiers||[]).forEach(t=> map.set(Number(t.threshold||0), Number(t.price||0)));
    const thresholds = Array.from(map.keys()).filter(n=>Number.isFinite(n) && n>0).sort((a,b)=>a-b);
    const use = thresholds.length ? thresholds : [...THRESHOLDS_DEFAULT];
    return use.map(th => ({ threshold: th, price: map.get(th) ?? 0 }));
  }

  function row(label, input){
    const wrap = document.createElement('div');
    wrap.className = 'grid grid-cols-3 gap-2 items-center';
    const l = document.createElement('div');
    l.className = 'text-sm font-bold text-slate-600';
    l.textContent = label;
    const r = document.createElement('div');
    r.className = 'col-span-2';
    r.appendChild(input);
    wrap.appendChild(l); wrap.appendChild(r);
    return wrap;
  }

  function createSnowTierRow(tier, idx, onPatch, onDelete){
    const line = document.createElement('div');
    line.className = 'grid grid-cols-12 gap-2 items-center';

    const drag = document.createElement('div');
    drag.className = 'col-span-1 drag-handle cursor-move text-slate-400 flex items-center justify-center';
    drag.title = '드래그로 순서 변경';
    drag.innerHTML = '<i class="fa-solid fa-bars"></i>';

    const thInp = document.createElement('input');
    thInp.type = 'number';
    thInp.step = '1';
    thInp.min = '1';
    thInp.className = 'col-span-3 px-3 py-2 border border-slate-200 rounded-lg font-extrabold text-slate-700';
    thInp.value = tier.threshold;

    const thLabel = document.createElement('div');
    thLabel.className = 'col-span-1 text-xs text-slate-400 font-bold';
    thLabel.textContent = '매';

    const priceInp = document.createElement('input');
    priceInp.type = 'number';
    priceInp.step = '1';
    priceInp.className = 'col-span-6 px-3 py-2 border border-slate-200 rounded-lg';
    priceInp.value = tier.snow ?? 0;

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'col-span-1 px-2 py-2 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50';
    delBtn.innerHTML = '<i class="fa-solid fa-trash"></i>';

    thInp.addEventListener('input', ()=> onPatch(idx, { threshold: Number(thInp.value||0) }));
    priceInp.addEventListener('input', ()=> onPatch(idx, { snow: Number(priceInp.value||0) }));
    delBtn.addEventListener('click', ()=> onDelete(idx));

    line.appendChild(drag);


    line.appendChild(thInp);
    line.appendChild(thLabel);
    line.appendChild(priceInp);
    line.appendChild(delBtn);
    return line;
  }

  function createArteTierRow(tier, idx, onPatch){
    const line = document.createElement('div');
    line.className = 'grid grid-cols-12 gap-2 items-center';

    const th = document.createElement('div');
    th.className = 'col-span-5 text-sm font-extrabold text-slate-700';
    th.textContent = `${Number(tier.threshold||0).toLocaleString()}매`;

    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '1';
    inp.className = 'col-span-7 px-3 py-2 border border-slate-200 rounded-lg';
    inp.value = tier.arte ?? 0;
    inp.addEventListener('input', ()=> onPatch(idx, { arte: Number(inp.value||0) }));

    line.appendChild(th);
    line.appendChild(inp);
    return line;
  }

  function createFactorEditor(paperType, weight, value, onChange){
    const line = document.createElement('div');
    line.className = 'grid grid-cols-3 gap-2 items-center';
    const th = document.createElement('div');
    th.className = 'text-sm font-extrabold text-slate-700';
    th.textContent = `${weight}g`;
    const inp = document.createElement('input');
    inp.type = 'number';
    inp.step = '0.01';
    inp.className = 'col-span-2 px-3 py-2 border border-slate-200 rounded-lg';
    inp.value = value ?? 1;
    inp.addEventListener('input', ()=> onChange(`${paperType}_${weight}`, Number(inp.value||1)));
    line.appendChild(th);
    line.appendChild(inp);
    return line;
  }

  let currentConfig = null;
  let snowSortable = null;

  function render(config){
    currentConfig = config;
    el.snowBaseWrap.innerHTML = '';
    el.arteBaseWrap.innerHTML = '';

    const base = config?.digital_print?.output_base || {};
    const tiers0 = normalizeUnifiedTiers(base);

    // tmp state (shared tiers)
    const tmp = {
      tiers: tiers0.map(t=>({ threshold: Number(t.threshold||0), snow: Number(t.snow||0), arte: Number(t.arte||0) })),
      wfMap: null
    };
    currentConfig.__tmp = tmp;

    function sanitizeAndSort(){
      const m2 = new Map();
      tmp.tiers.forEach(t=>{
        const th = Number(t.threshold||0);
        if (!Number.isFinite(th) || th<=0) return;
        m2.set(th, { threshold: th, snow: Number(t.snow||0), arte: Number(t.arte||0) });
      });
      tmp.tiers = Array.from(m2.values());
    }

    function rerenderTiers(){
      sanitizeAndSort();
      el.snowBaseWrap.innerHTML = '';
      el.arteBaseWrap.innerHTML = '';
      tmp.tiers.forEach((t, idx)=>{
        el.snowBaseWrap.appendChild(createSnowTierRow(t, idx, (i, patch)=>{
          tmp.tiers[i] = { ...tmp.tiers[i], ...patch };
        }, (i)=>{
          tmp.tiers.splice(i, 1);
          rerenderTiers();
        }));
        el.arteBaseWrap.appendChild(createArteTierRow(t, idx, (i, patch)=>{
          tmp.tiers[i] = { ...tmp.tiers[i], ...patch };
        }));
      });

      // drag & drop reorder (snow list is the source of truth)
      if (window.Sortable && el.snowBaseWrap){
        try { if (snowSortable) snowSortable.destroy(); } catch(e){}
        snowSortable = new Sortable(el.snowBaseWrap, {
          animation: 150,
          handle: '.drag-handle',
          onEnd: (evt)=>{
            if (evt.oldIndex === evt.newIndex) return;
            const moved = tmp.tiers.splice(evt.oldIndex, 1)[0];
            tmp.tiers.splice(evt.newIndex, 0, moved);
            rerenderTiers();
          }
        });
      }

    }

    if (el.addTierBtn){
      el.addTierBtn.onclick = ()=>{
        sanitizeAndSort();
        const last = tmp.tiers[tmp.tiers.length-1]?.threshold || 0;
        const next = last ? (last + 10) : 10;
        tmp.tiers.push({ threshold: next, snow: 0, arte: 0 });
        rerenderTiers();
      };
    }

    rerenderTiers();

    // factors
    el.snowFactorWrap.innerHTML = '';
    el.arteFactorWrap.innerHTML = '';
    const wf = config?.digital_print?.weight_factor || {};

    const snowWeights = [120,150,180,200,220,250];
    const arteWeights = [180,200,210,250];

    const wfMap = new Map(Object.entries(wf).map(([k,v])=>[k,Number(v)]));
    tmp.wfMap = wfMap;
    snowWeights.forEach(w=> el.snowFactorWrap.appendChild(createFactorEditor('snow', w, wfMap.get(`snow_${w}`), (k,v)=> wfMap.set(k,v))));
    arteWeights.forEach(w=> el.arteFactorWrap.appendChild(createFactorEditor('arte', w, wfMap.get(`arte_${w}`), (k,v)=> wfMap.set(k,v))));

    // size
    const sz = config?.digital_print?.size || {};
    const mul = sz?.multipliers || {};
    el.mulA3.value = mul.A3 ?? 2.00;
    el.mulA4.value = mul.A4 ?? 1.00;
    el.mulA5.value = mul.A5 ?? 0.60;
    el.mulB5.value = mul.B5 ?? 0.72;
    el.minMul.value = sz.minMultiplier ?? 0.60;

    // oshi
    const o = config?.digital_print?.oshi || {};
    el.oshiOne.value = o.oneLine ?? 50;
    el.oshiTwo.value = o.twoLine ?? 80;
    el.oshiThree.value = o.threeLine ?? 0;
  }

  async function loadConfig(){
    const ref = doc(db, 'settings', 'unitPriceConfig');
    const snap = await getDoc(ref);
    const remote = snap.exists() ? (snap.data()||{}) : {};
    const merged = deepMerge(DEFAULTS, remote);

    // Normalize tiers (custom thresholds 유지)
    merged.digital_print = merged.digital_print || {};
    merged.digital_print.output_base = merged.digital_print.output_base || {};
    merged.digital_print.output_base.snow_200 = (merged.digital_print.output_base.snow_200 && merged.digital_print.output_base.snow_200.length)
      ? normalizeTiers(merged.digital_print.output_base.snow_200)
      : normalizeTiers(DEFAULTS.digital_print.output_base.snow_200);
    merged.digital_print.output_base.arte_200 = (merged.digital_print.output_base.arte_200 && merged.digital_print.output_base.arte_200.length)
      ? normalizeTiers(merged.digital_print.output_base.arte_200)
      : normalizeTiers(DEFAULTS.digital_print.output_base.arte_200);
    return merged;
  }

  async function loadGuide(){
    if (!el.guidePreview) return;
    try{
      const snap = await getDoc(doc(db, "settings", "print"));
      const data = snap.exists() ? (snap.data()||{}) : {};
      const guideHtml = (data.guideHtml || "").trim();
      const guideText = (data.guide || "").trim();
      const guideUpdatedAt = Number(data.guideUpdatedAt || 0);

      if (guideHtml){
        el.guidePreview.innerHTML = guideHtml;
        if (el.guideEditor) el.guideEditor.innerHTML = guideHtml;
      } else {
        el.guidePreview.textContent = guideText ? guideText : "등록된 안내문이 없습니다.";
        // NOTE: 정규식은 반드시 한 줄에 완전한 형태로 존재해야 함 (파싱 에러 방지)
        if (el.guideEditor) el.guideEditor.innerHTML = (guideText || "").replace(/\n/g, '<br>');
      }

      // 임시저장본 자동 복구 (adminEdit 모드에서만)
      try{
        if (isAdminEditMode()){
          const draftHtml = (localStorage.getItem(GUIDE_DRAFT_KEY) || '').trim();
          const draftAt = Number(localStorage.getItem(GUIDE_DRAFT_AT_KEY) || 0);
          if (draftHtml && draftAt && draftAt > guideUpdatedAt){
            const ok = confirm('임시저장된 안내문이 있습니다. 불러올까요?');
            if (ok && el.guideEditor){
              el.guideEditor.innerHTML = draftHtml;
            }
          }
        }
      }catch(e){}
    }catch(e){
      el.guidePreview.textContent = "안내문을 불러오지 못했습니다.";
    }
  }

  function htmlToPlainText(html){
    // 서식 유지 HTML을 텍스트로 변환 (최소한의 줄바꿈만 보존)
    const s = String(html || '');
    return s
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|li|h1|h2|h3|blockquote)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  async function saveGuide(){
    const html = (el.guideEditor?.innerHTML || "").trim();
    const text = htmlToPlainText(html);
    await setDoc(doc(db, "settings", "print"), { guideHtml: html, guide: text, guideUpdatedAt: Date.now() }, { merge: true });
    // 저장 성공 시 임시저장본 삭제
    try{
      localStorage.removeItem(GUIDE_DRAFT_KEY);
      localStorage.removeItem(GUIDE_DRAFT_AT_KEY);
    }catch(e){}
    await loadGuide();
    alert("안내문 저장 완료!");
  }

  function tempSaveGuide(){
    const html = (el.guideEditor?.innerHTML || '').trim();
    if (!html){
      alert('임시저장할 내용이 없습니다.');
      return;
    }
    try{
      localStorage.setItem(GUIDE_DRAFT_KEY, html);
      localStorage.setItem(GUIDE_DRAFT_AT_KEY, String(Date.now()));
      alert('임시저장 완료! (이 브라우저에 저장됩니다)');
    }catch(e){
      alert('임시저장에 실패했습니다. (브라우저 저장공간/정책 확인)');
    }
  }

  async function loadSavedGuideIntoEditor(){
    if (!el.guideEditor) return;
    const ok = confirm('현재 편집 중인 내용은 사라집니다. 저장된 안내문으로 불러올까요?');
    if (!ok) return;
    try{
      const snap = await getDoc(doc(db, "settings", "print"));
      const data = snap.exists() ? (snap.data()||{}) : {};
      const guideHtml = (data.guideHtml || '').trim();
      const guideText = (data.guide || '').trim();
      if (guideHtml){
        el.guideEditor.innerHTML = guideHtml;
      }else{
        el.guideEditor.innerHTML = (guideText || '').replace(/\n/g, '<br>');
      }
      el.guideEditor.focus();
    }catch(e){
      alert('저장된 안내문을 불러오지 못했습니다.');
    }
  }

  function rewriteGuide(){
    if (!el.guideEditor) return;
    const ok = confirm('새로 작성할까요? (현재 편집 중인 내용은 사라집니다)');
    if (!ok) return;
    el.guideEditor.innerHTML = '';
    el.guideEditor.focus();
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

  function setupGuideEditor(){
    const editor = document.getElementById('wg-content-editor');
    if (!editor) return;

    // ✅ Fullscreen toggle (긴 글 작성 시 스크롤/툴바 문제 해결)
    let fsBtn = document.getElementById('wg-fullscreen-btn');
    function setFullscreen(on){
      try{
        document.body.classList.toggle('wg-fullscreen', !!on);
        if (fsBtn){
          fsBtn.dataset.on = on ? '1' : '0';
          fsBtn.innerHTML = on
            ? '<i class="fas fa-down-left-and-up-right-to-center mr-1"></i>닫기'
            : '<i class="fas fa-up-right-and-down-left-from-center mr-1"></i>전체화면';
          fsBtn.title = on ? '전체화면 종료 (Esc)' : '전체화면 편집';
        }
      }catch(e){}
    }

    if (fsBtn){
      const newFsBtn = fsBtn.cloneNode(true);
      fsBtn.parentNode.replaceChild(newFsBtn, fsBtn);
      fsBtn = newFsBtn;
      newFsBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); });
      newFsBtn.addEventListener('click', (e)=>{
        e.preventDefault();
        const isOn = document.body.classList.contains('wg-fullscreen');
        setFullscreen(!isOn);
        try{ editor.focus(); }catch(err){}
      });
    }

    // Esc to exit fullscreen
    document.addEventListener('keydown', (e)=>{
      if (e.key === 'Escape' && document.body.classList.contains('wg-fullscreen')){
        setFullscreen(false);
        try{ editor.focus(); }catch(err){}
      }
    }, { passive: true });

    // --- selection fix: keep selection when clicking toolbar (immediate apply) ---
    let savedRange = null;

    function saveSelection() {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      if (editor.contains(range.commonAncestorContainer)) {
        savedRange = range.cloneRange();
      }
    }

    function restoreSelection() {
      if (!savedRange) return;
      const sel = window.getSelection();
      if (!sel) return;
      sel.removeAllRanges();
      sel.addRange(savedRange);
    }

    ['keyup','mouseup','touchend','focus'].forEach(evt => {
      editor.addEventListener(evt, saveSelection);
    });

    // If clicking anywhere on toolbar buttons, prevent default to keep selection
    const btns = document.querySelectorAll('.wg-editor-btn');
    btns.forEach(btn => {
      const newBtn = btn.cloneNode(true);
      btn.parentNode.replaceChild(newBtn, btn);

      // prevent selection loss
      newBtn.addEventListener('mousedown', (e)=>{
        e.preventDefault();
      });

      // apply command on mousedown for snappier response
      newBtn.addEventListener('mousedown', (e)=>{
        e.preventDefault();
        editor.focus();
        restoreSelection();

        const cmd = newBtn.dataset.cmd;
        const align = newBtn.dataset.align;
        const list = newBtn.dataset.list;

        const run = (command) => {
          requestAnimationFrame(()=>{
            try { document.execCommand(command, false, null); } catch(err) {}
            saveSelection();
          });
        };

        if (cmd) run(cmd);
        else if (align){
          if (align === 'left') run('justifyLeft');
          if (align === 'center') run('justifyCenter');
          if (align === 'right') run('justifyRight');
        } else if (list){
          if (list === 'ul') run('insertUnorderedList');
          if (list === 'ol') run('insertOrderedList');
        }
      });
    });

    const sizeSel = document.getElementById('wg-font-size');
    if (sizeSel){
      const newSel = sizeSel.cloneNode(true);
      sizeSel.parentNode.replaceChild(newSel, sizeSel);

      newSel.addEventListener('mousedown', (e)=>{
        // keep selection when opening select
        saveSelection();
      });

      newSel.addEventListener('change', ()=>{
        const px = parseInt(newSel.value || '14', 10);
        if (!px) return;
        editor.focus();
        restoreSelection();
        requestAnimationFrame(()=>{
          applyInlineStyleToSelection({ 'font-size': px + 'px' });
          saveSelection();
        });
      });
    }

    const clearBtn = document.getElementById('wg-clear-format-btn');
    if (clearBtn){
      const newBtn = clearBtn.cloneNode(true);
      clearBtn.parentNode.replaceChild(newBtn, clearBtn);

      newBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); });

      newBtn.addEventListener('mousedown', ()=>{
        // clear formatting (best-effort)
        const plain = (editor.innerText || '');
        editor.innerHTML = plain.replace(/\n/g, '<br>');
        editor.focus();
        saveSelection();
      });
    }

    const urlBtn = document.getElementById('wg-insert-url-btn');
    if (urlBtn){
      const newBtn = urlBtn.cloneNode(true);
      urlBtn.parentNode.replaceChild(newBtn, urlBtn);

      newBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); });

      newBtn.addEventListener('mousedown', (e)=>{
        e.preventDefault();
        const url = prompt('이미지 주소(URL)를 입력하세요:');
        if (url){
          editor.focus();
          restoreSelection();
          requestAnimationFrame(()=>{
            try { document.execCommand('insertImage', false, url); } catch(err) {}
            saveSelection();
          });
        }
      });
    }

    const imgBtn = document.getElementById('wg-insert-image-btn');
    const imgInput = document.getElementById('wg-image-input');
    if (imgBtn && imgInput){
      const newImgBtn = imgBtn.cloneNode(true);
      imgBtn.parentNode.replaceChild(newImgBtn, imgBtn);
      const newImgInput = imgInput.cloneNode(true);
      imgInput.parentNode.replaceChild(newImgInput, imgInput);

      newImgBtn.addEventListener('mousedown', (e)=>{ e.preventDefault(); });

      newImgBtn.addEventListener('mousedown', (e)=>{
        e.preventDefault();
        // store selection before file picker steals focus
        saveSelection();
        newImgInput.click();
      });

      newImgInput.addEventListener('change', async ()=>{
        const file = newImgInput.files?.[0];
        if (!file) return;
        const originalText = newImgBtn.innerHTML;
        newImgBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
        newImgBtn.disabled = true;
        try {
          const ts = Date.now();
          const safeName = (file.name || 'image').replace(/[^a-z0-9._-]/gi, '_');
          const path = `print_guides/guide/images/${ts}_${safeName}`;
          const r = storageRef(storage, path);
          await uploadBytes(r, file);
          const url = await getDownloadURL(r);

          editor.focus();
          restoreSelection();
          requestAnimationFrame(()=>{
            try { document.execCommand('insertImage', false, url); } catch(err) {}
            saveSelection();
          });
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


  function buildPayload(){
    const cfg = JSON.parse(JSON.stringify(currentConfig || DEFAULTS));
    const tmp = currentConfig?.__tmp;
    if (!tmp) return cfg;

    cfg.digital_print.output_base = cfg.digital_print.output_base || {};
    const tiers = (tmp.tiers || []).slice().map(t=>({
      threshold: Number(t.threshold||0),
      snow: Number(t.snow||0),
      arte: Number(t.arte||0)
    })).filter(t=>Number.isFinite(t.threshold) && t.threshold>0);

    cfg.digital_print.output_base.snow_200 = tiers.map(t=>({ threshold: t.threshold, price: t.snow }));
    cfg.digital_print.output_base.arte_200 = tiers.map(t=>({ threshold: t.threshold, price: t.arte }));

    cfg.digital_print.weight_factor = Object.fromEntries([...(tmp.wfMap || new Map()).entries()].map(([k,v])=>[k, Number(v||1)]));
    cfg.digital_print.size = {
      minMultiplier: Number(el.minMul.value || 0.6),
      multipliers: {
        A3: Number(el.mulA3.value || 2),
        A4: Number(el.mulA4.value || 1),
        A5: Number(el.mulA5.value || 0.6),
        B5: Number(el.mulB5.value || 0.72),
      }
    };
    cfg.digital_print.oshi = {
      oneLine: Number(el.oshiOne.value || 0),
      twoLine: Number(el.oshiTwo.value || 0),
      threeLine: Number(el.oshiThree.value || 0),
    };

    // housekeeping: remove tmp
    delete cfg.__tmp;
    return cfg;
  }

  async function save(){
    const payload = buildPayload();
    await setDoc(doc(db, 'settings', 'unitPriceConfig'), payload, { merge: true });
    alert('저장 완료!');
  }

  async function boot(){
    onAuthStateChanged(auth, async (user) => { try { window.__currentFirebaseUser = user; } catch(e) {}
      // 페이지 자체는 로그인 없이도 뜨지만 저장은 관리자가 해야 함.
      // 기존 시스템에서는 rules로 막혀있을 수 있으니, 여기선 안내만.
      el.adminWarn.classList.toggle('hidden', !!user);
    });

    const cfg = await loadConfig();
    render(cfg);

    const adminEdit = isAdminEditMode();
    // 단가/안내문 편집은 adminEdit=1 일 때만 활성화
    if (!adminEdit){
      try{
        el.saveBtn.disabled = true;
        el.saveBtn.classList.add('opacity-50','cursor-not-allowed');
      }catch(e){}
      el.guideEditorWrap?.classList.add('hidden');
      el.guideEditHint?.classList.remove('hidden');
    }else{
      try{
        el.saveBtn.disabled = false;
        el.saveBtn.classList.remove('opacity-50','cursor-not-allowed');
      }catch(e){}
      el.guideEditorWrap?.classList.remove('hidden');
      el.guideEditHint?.classList.add('hidden');
      setupGuideEditor();
      el.saveGuideBtn?.addEventListener('click', saveGuide);
      el.guideTempSaveBtn?.addEventListener('click', tempSaveGuide);
      el.guideLoadSavedBtn?.addEventListener('click', loadSavedGuideIntoEditor);
      el.guideRewriteBtn?.addEventListener('click', rewriteGuide);
    }

    await loadGuide();


    el.reloadBtn.addEventListener('click', async ()=> render(await loadConfig()));
    el.saveBtn.addEventListener('click', save);
  }

  boot();
