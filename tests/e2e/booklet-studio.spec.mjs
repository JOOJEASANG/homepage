import {test,expect} from '@playwright/test';
import {bookletPlan} from '../../assets/js/pages/print-studio/booklet.js';
test('booklet plan preserves covers and pads only inner pages',()=>{
 expect(bookletPlan(16).sheets).toEqual([{number:1,front:[16,1],back:[2,15]},{number:2,front:[14,3],back:[4,13]},{number:3,front:[12,5],back:[6,11]},{number:4,front:[10,7],back:[8,9]}]);
 expect(bookletPlan(10).sheets).toEqual([{number:1,front:[10,1],back:[2,9]},{number:2,front:[null,3],back:[4,null]},{number:3,front:[8,5],back:[6,7]}]);
 expect(bookletPlan(4,'right').sheets[0]).toEqual({number:1,front:[1,4],back:[3,2]});
 expect(bookletPlan(4,'left','excluded').sheets).toEqual([{number:1,front:['cover4','cover1'],back:['cover2','cover3']},{number:2,front:[4,1],back:[2,3]}]);
 for(const cover of ['included','excluded'])for(const n of [4,5,10,16,99,1000,...(cover==='excluded'?[1,2,3]:[])]){
  const p=bookletPlan(n,'left',cover),all=p.sheets.flatMap(s=>[...s.front,...s.back]);
  expect(all.filter(x=>typeof x==='number').sort((a,b)=>a-b)).toEqual(Array.from({length:n},(_,i)=>i+1));
  expect(all.filter(x=>x===null)).toHaveLength(p.blanks);
  expect(all.filter(x=>typeof x==='string')).toHaveLength(cover==='excluded'?4:0);
  expect(p.count).toBe(p.innerCount+1);expect(p.total).toBe(4*p.count);
  expect(p.total).toBe(n+p.blanks+(cover==='excluded'?4:0));
  const right=bookletPlan(n,'right',cover);expect(right.sheets).toEqual(p.sheets.map(s=>({...s,front:[...s.front].reverse(),back:[...s.back].reverse()})));
 }
 for(const n of [0,1,2,3,4.5,1001,NaN])expect(()=>bookletPlan(n)).toThrow();
 expect(()=>bookletPlan(0,'left','excluded')).toThrow();
});
test('booklet starts at four pages and shows cover mode, count and vertically ordered results',async({page})=>{
 await page.goto('/booklet-studio.html',{waitUntil:'domcontentloaded'});
 const input=page.locator('#booklet-pages'),sheets=page.locator('.booklet-sheet');
 await expect(input).toHaveValue('4');await expect(sheets).toHaveCount(1);
 await expect(sheets.first().locator('[data-face=front] .page-number')).toHaveText(['4','1']);
 await expect(sheets.first().locator('[data-face=front] .cover-label')).toHaveText(['뒤표지','앞표지']);
 await expect(page.locator('#booklet-inner-count')).toHaveText('0장');
 await page.locator('#booklet-cover').selectOption('excluded');await expect(sheets).toHaveCount(2);
 await expect(page.locator('#booklet-total')).toHaveText('8쪽');
 await expect(sheets.first().locator('[data-face=back] .cover-label')).toHaveText(['앞표지 안쪽','뒤표지 안쪽']);
 await expect(sheets.nth(1).locator('[data-face=front] .page-number')).toHaveText(['4','1']);
 await input.fill('10');await expect(sheets).toHaveCount(4);
 await expect(page.locator('#booklet-total')).toHaveText('16쪽');
 await expect(page.locator('#booklet-count')).toHaveText('4장');
 await expect(page.locator('#booklet-cover-count')).toHaveText('1장');
 await expect(page.locator('#booklet-inner-count')).toHaveText('3장');
 await expect(page.locator('#booklet-blanks')).toHaveText('2쪽');
 await expect(sheets.nth(1).locator('[data-face=front] .booklet-page')).toHaveText(['빈 페이지','1']);
 await expect(sheets.nth(1).locator('[data-face=back] .booklet-page')).toHaveText(['2','빈 페이지']);
 await page.locator('#booklet-direction').selectOption('right');
 await expect(sheets.nth(1).locator('[data-face=front] .booklet-page')).toHaveText(['1','빈 페이지']);
 const bounds=await sheets.evaluateAll(nodes=>nodes.map(n=>({x:n.getBoundingClientRect().x,y:n.getBoundingClientRect().y,bottom:n.getBoundingClientRect().bottom})));
 expect(bounds.every((b,i)=>i===0||(Math.abs(b.x-bounds[0].x)<1&&b.y>=bounds[i-1].bottom))).toBe(true);
 await input.fill('0');await expect(page.locator('#booklet-error')).toBeVisible();await expect(sheets).toHaveCount(0);
 await input.fill('8');await expect(page.locator('#booklet-error')).toBeHidden();await expect(sheets).toHaveCount(3);
 await page.locator('#booklet-cover').selectOption('included');await expect(sheets).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
