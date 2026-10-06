// Present existing price editors inside the authenticated admin workspace.
// Keep frames mounted so switching menus preserves unsaved edits.
export function activateAdminWorkspace(tabId) {
  if (!tabId) return;
  const panel = document.getElementById(`${tabId}-content`);
  if (!panel?.classList.contains('main-tab-content')) return;

  document.querySelectorAll('.nav-item[data-tab]').forEach(button => {
    const active = button.dataset.tab === tabId;
    button.classList.toggle('active', active);
    if (active) button.setAttribute('aria-current', 'page');
    else button.removeAttribute('aria-current');
  });
  document.querySelectorAll('.main-tab-content').forEach(content => {
    content.classList.toggle('active', content === panel);
  });

  const frame = panel.querySelector('iframe[data-price-src]');
  if (frame && !frame.hasAttribute('src')) frame.src = frame.dataset.priceSrc;
}

export function initAdminWorkspaceNavigation() {
  for (const id of ['top-nav-bar', 'mobile-nav-bar']) {
    const nav = document.getElementById(id);
    if (!nav || nav.dataset.workspaceNavigationBound === '1') continue;
    nav.dataset.workspaceNavigationBound = '1';
    nav.addEventListener('click', event => {
      const button = event.target.closest('.nav-item[data-tab]');
      if (button && nav.contains(button)) activateAdminWorkspace(button.dataset.tab);
    });
  }
}
