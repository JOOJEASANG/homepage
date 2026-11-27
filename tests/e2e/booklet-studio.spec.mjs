import {test,expect} from '@playwright/test';
import {bookletPlan} from '../../assets/js/pages/print-studio/booklet.js';
test('booklet plan pads at end, reverses direction, and uses each original page exactly once',()=>{
 expect(bookletPlan(16).sheets).toEqual([{number:1,front:[16,1],back:[2,15]},{number:2,front:[14,3],back:[4,13]},{number:3,front:[12,5],back:[6,11]},{number:4,front:[10,7],back:[8,9]}]);
 expect(bookletPlan(10).sheets[0]).toEqual({number:1,front:[null,1],back:[2,null]});
 expect(bookletPlan(4,'right').sheets[0]).toEqual({number:1,front:[1,4],back:[3,2]});
 for(const n of [1,2,3,4,5,10,16,99,1000]){
  const p=bookletPlan(n),all=p.sheets.flatMap(s=>[...s.front,...s.back]);
  expect(all.filter(x=>x!==null).sort((a,b)=>a-b)).toEqual(Array.from({length:n},(_,i)=>i+1));
  expect(all.filter(x=>x===null)).toHaveLength(p.total-n);
 }
 for(const n of [0,1.5,1001,NaN])expect(()=>bookletPlan(n)).toThrow();
});
test('booklet preview updates sheet faces, blank count and direction responsively',async({page})=>{
 await page.goto('/booklet-studio.html',{waitUntil:'domcontentloaded'});
 const input=page.locator('#booklet-pages'),sheets=page.locator('.booklet-sheet');
 await expect(sheets).toHaveCount(4);
 await expect(sheets.first().locator('[data-face=front] .booklet-page')).toHaveText(['16','1']);
 await input.fill('10');await expect(sheets).toHaveCount(3);
 await expect(page.locator('#booklet-total')).toHaveText('12쪽');
 await expect(page.locator('#booklet-count')).toHaveText('3장');
 await expect(page.locator('#booklet-blanks')).toHaveText('2쪽');
 await expect(sheets.first().locator('[data-face=front] .booklet-page')).toHaveText(['빈 페이지','1']);
 await expect(sheets.first().locator('[data-face=back] .booklet-page')).toHaveText(['2','빈 페이지']);
 await page.locator('#booklet-direction').selectOption('right');
 await expect(sheets.first().locator('[data-face=front] .booklet-page')).toHaveText(['1','빈 페이지']);
 await input.fill('0');await expect(page.locator('#booklet-error')).toBeVisible();await expect(sheets).toHaveCount(0);
 await input.fill('8');await expect(page.locator('#booklet-error')).toBeHidden();await expect(sheets).toHaveCount(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});
