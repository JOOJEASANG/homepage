export const BUILTIN_NAMES={plain:'흰색',report:'보고서',education:'교육',classic:'클래식',soft:'파스텔'};
export const DEFAULT_STUDIO_SETTINGS={cover:{bleed:3,margin:10,adjust:0,caliper:.1},layout:{bleed:3,margin:5,gapX:3,gapY:3,edge:3,compensation:3},papers:[],sheets:[],templates:[],hiddenBuiltins:[]};
const bounded=(v,min,max,def)=>v!==''&&v!=null&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):def;
const label=(v,max=80)=>String(v??'').trim().slice(0,max);
export function validTemplatePath(path){return /^public\/print-studio\/templates\/[a-z0-9-]{20,80}\.(?:jpg|png)$/.test(String(path||''));}
export function validTemplateURL(url,path){
  if(!validTemplatePath(path))return false;
  try{const u=new URL(url);return u.protocol==='https:'&&u.hostname==='firebasestorage.googleapis.com'&&!u.username&&!u.password&&!u.port&&/^\/v0\/b\/(worklist-1e83a\.firebasestorage\.app|worklist-1e83a\.appspot\.com)\/o\//.test(u.pathname)&&decodeURIComponent(u.pathname.split('/o/')[1])===path&&u.searchParams.get('alt')==='media';}catch{return false;}
}
function template(t){
  if(!t||!/^custom-[a-z0-9-]{20,80}$/.test(t.id||'')||!validTemplateURL(t.url,t.path))return null;
  if(t.path.split('/').pop().split('.')[0]!==t.id.slice(7))return null;
  const width=bounded(t.width,1,12000,0),height=bounded(t.height,1,12000,0);
  if(!width||!height||width*height>60000000)return null;
  return {id:t.id,name:label(t.name)||'표지 디자인',category:label(t.category,40)||'기타',url:t.url,path:t.path,width,height,enabled:t.enabled!==false};
}
export function normalizeStudioSettings(raw={}){
  const d=DEFAULT_STUDIO_SETTINGS,c=raw.cover||{},l=raw.layout||{};
  const papers=(Array.isArray(raw.papers)?raw.papers:[]).slice(0,40).map(p=>({name:label(p?.name),caliper:bounded(p?.caliper,.03,1,0)})).filter(p=>p.name&&p.caliper);
  const sheets=(Array.isArray(raw.sheets)?raw.sheets:[]).slice(0,30).map(p=>({name:label(p?.name),width:bounded(p?.width,30,1500,0),height:bounded(p?.height,30,1500,0)})).filter(p=>p.name&&p.width&&p.height);
  const ids=new Set(),templates=(Array.isArray(raw.templates)?raw.templates:[]).slice(0,30).map(template).filter(t=>t&&!ids.has(t.id)&&ids.add(t.id));
  return {cover:{bleed:bounded(c.bleed,0,10,d.cover.bleed),margin:bounded(c.margin,0,30,d.cover.margin),adjust:bounded(c.adjust,0,10,d.cover.adjust),caliper:bounded(c.caliper,.03,1,d.cover.caliper)},layout:{bleed:bounded(l.bleed,0,15,d.layout.bleed),margin:bounded(l.margin,0,50,d.layout.margin),gapX:bounded(l.gapX,0,100,d.layout.gapX),gapY:bounded(l.gapY,0,100,d.layout.gapY),edge:bounded(l.edge,0,100,d.layout.edge),compensation:bounded(l.compensation,0,10,d.layout.compensation)},papers,sheets,templates,hiddenBuiltins:[...new Set((Array.isArray(raw.hiddenBuiltins)?raw.hiddenBuiltins:[]).filter(k=>k!=='plain'&&Object.hasOwn(BUILTIN_NAMES,k)))]};
}
export function publicStudioSettings(raw){
  const s=normalizeStudioSettings(raw);
  return {...s,templates:s.templates.filter(t=>t.enabled).map(({enabled,...t})=>t)};
}
export function validatePresetRows(rows,kind){
  const fields=kind==='paper'?['name','caliper']:['name','width','height'];
  return rows.filter(r=>fields.some(k=>String(r[k]??'').trim())).map(r=>{
    if(!label(r.name))throw Error('용지 이름을 입력해 주세요.');
    const v=kind==='paper'?{name:label(r.name),caliper:bounded(r.caliper,.03,1,0)}:{name:label(r.name),width:bounded(r.width,30,1500,0),height:bounded(r.height,30,1500,0)};
    if(fields.some(k=>!v[k]))throw Error('용지 치수 또는 두께의 입력 범위를 확인해 주세요.');
    return v;
  });
}
