const loads = new WeakMap();

export function loadWorkGuideWorkspace(panel) {
  if (loads.has(panel)) return loads.get(panel);
  const loading = (async () => {
    const response = await fetch('work-guide.html', { cache: 'no-cache' });
    if (!response.ok) throw new Error('Guide page could not be loaded');
    const source = new DOMParser().parseFromString(await response.text(), 'text/html');
    const guide = source.getElementById('workGuideModal');
    if (!guide) throw new Error('Guide content is missing');
    guide.className = 'admin-guide-layout flex';
    guide.firstElementChild.className = 'admin-guide-shell flex flex-col md:flex-row';
    panel.replaceChildren(guide);
    // Reuse the administrator's existing Auth instance and session in this document.
    await import('../work-guide.js');
  })().catch(() => {
    loads.delete(panel);
    const message = document.createElement('p');
    message.className = 'p-6 text-slate-600';
    message.textContent = '작업 가이드를 불러오지 못했습니다. 다시 시도해 주세요.';
    const retry = document.createElement('button');
    retry.type = 'button';
    retry.className = 'btn btn-primary m-6';
    retry.textContent = '다시 불러오기';
    retry.addEventListener('click', () => loadWorkGuideWorkspace(panel));
    panel.replaceChildren(message, retry);
  });
  loads.set(panel, loading);
  return loading;
}
