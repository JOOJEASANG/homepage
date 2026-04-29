// assets/js/theme.js
const STORAGE_KEY = "siteTheme";

export const THEMES = [
  { key: "clean", label: "클린(기본)", dot: "#16a34a" },
  { key: "adpia", label: "성원애드피아 느낌", dot: "#6d28d9" },
  { key: "dark", label: "다크", dot: "#22c55e" },
];

function classNameFor(key){
  if (key === "adpia") return "theme-adpia";
  if (key === "dark") return "theme-dark";
  return ""; // clean = default
}

export function getTheme(){
  try { return localStorage.getItem(STORAGE_KEY) || "clean"; } catch(e){ return "clean"; }
}

export function applyTheme(key){
  const root = document.documentElement;
  root.classList.remove("theme-adpia", "theme-dark");
  const cls = classNameFor(key);
  if (cls) root.classList.add(cls);
  try { localStorage.setItem(STORAGE_KEY, key); } catch(e){}
}

export function initTheme(){
  applyTheme(getTheme());
}

/** Bind theme dropdown UI (expects #theme-toggle, #theme-menu, [data-theme]) */
export function bindThemeUI(){
  const toggle = document.getElementById("theme-toggle");
  const menu = document.getElementById("theme-menu");
  if (!toggle || !menu) return;

  // paint current label
  const paint = () => {
    const cur = getTheme();
    const item = THEMES.find(t=>t.key===cur) || THEMES[0];
    const label = document.getElementById("theme-current-label");
    const dot = document.getElementById("theme-current-dot");
    if (label) label.textContent = item.label;
    if (dot) dot.style.background = item.dot;
  };

  paint();

  const closeMenu = () => menu.classList.remove("open");

  toggle.addEventListener("click", (e)=>{
    e.preventDefault();
    e.stopPropagation();
    menu.classList.toggle("open");
  });

  menu.addEventListener("click", (e)=>{
    const btn = e.target.closest("[data-theme]");
    if (!btn) return;
    const key = btn.getAttribute("data-theme");
    applyTheme(key);
    paint();
    closeMenu();
  });

  // outside click / ESC
  document.addEventListener("click", (e)=>{
    if (!menu.classList.contains("open")) return;
    if (e.target.closest("#theme-toggle") || e.target.closest("#theme-menu")) return;
    closeMenu();
  });
  document.addEventListener("keydown", (e)=>{
    if (e.key === "Escape") closeMenu();
  });
}
