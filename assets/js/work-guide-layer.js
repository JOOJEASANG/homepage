// Public guide navigation must work before Firebase/session initialization finishes.
export function openWorkGuideLayer(trigger = document.activeElement) {
  const existing = document.getElementById('wg-layer-overlay');
  if (existing) return;

  const overlay = document.createElement('div');
  overlay.id = 'wg-layer-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', '작업가이드');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(15,23,42,.65)';
  const panel = document.createElement('div');
  panel.style.cssText = 'position:relative;width:100%;max-width:1152px;height:90dvh;background:white;border-radius:16px;overflow:hidden;box-shadow:0 20px 60px #0004';
  const frame = document.createElement('iframe');
  frame.src = 'work-guide.html?embed=1';
  frame.title = '작업가이드 내용';
  frame.style.cssText = 'display:block;width:100%;height:100%;border:0';
  const close = document.createElement('button');
  close.type = 'button';
  close.textContent = '×';
  close.setAttribute('aria-label', '작업가이드 닫기');
  close.style.cssText = 'position:absolute;top:8px;right:8px;z-index:100;width:40px;height:40px;border-radius:50%;border:1px solid #e2e8f0;background:white;color:#475569;font-size:28px;cursor:pointer';
  panel.append(frame, close);
  overlay.append(panel);
  const previousOverflow = document.body.style.overflow;
  document.body.append(overlay);
  document.body.style.overflow = 'hidden';

  function cleanup() {
    window.removeEventListener('message', onMessage);
    document.removeEventListener('keydown', onKey);
    overlay.remove();
    document.body.style.overflow = previousOverflow;
    if (trigger?.isConnected && trigger.getClientRects().length) trigger.focus();
    else (document.getElementById('btn-mobile-menu') || document.getElementById('btn-mobile-menu-shell'))?.focus();
  }
  function onKey(event) {
    if (event.key === 'Escape') cleanup();
    if (event.key === 'Tab' && event.shiftKey && document.activeElement === close) {
      event.preventDefault();
      frame.focus();
    }
  }
  function onMessage(event) {
    if (event.origin === location.origin && event.source === frame.contentWindow
      && event.data?.type === 'CLOSE_WORK_GUIDE') cleanup();
  }
  close.addEventListener('click', cleanup);
  overlay.addEventListener('click', event => { if (event.target === overlay) cleanup(); });
  document.addEventListener('keydown', onKey);
  window.addEventListener('message', onMessage);
  close.focus();
}

document.addEventListener('click', event => {
  const trigger = event.target?.closest?.('[data-action="work-guide"], a[href]');
  if (!trigger || event.defaultPrevented || event.button > 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  if (trigger.dataset.action !== 'work-guide') {
    const url = new URL(trigger.href, location.href);
    if (url.origin !== location.origin || !url.pathname.endsWith('/work-guide.html') || trigger.target === '_blank') return;
  }
  event.preventDefault();
  document.getElementById('mobile-menu')?.classList.add('hidden');
  document.getElementById('mobile-menu-shell')?.classList.add('hidden');
  document.getElementById('btn-mobile-menu-shell')?.setAttribute('aria-expanded', 'false');
  openWorkGuideLayer(trigger);
});
