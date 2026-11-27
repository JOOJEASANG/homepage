import {test,expect} from '@playwright/test';
test('cover studio geometry, design, editing, undo and print output',async({page})=>{
 await page.goto('/cover-studio.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#print-cover')).toBeEnabled();
 await expect(page.locator('#spine-width')).toHaveText('10');
 await expect(page.locator('#cover-dimensions')).toHaveText('436 × 303 mm (도련 포함)');
 await page.locator('#pages').fill('201');await page.locator('#pages').blur();
 await expect(page.locator('#spine-width')).toHaveText('10.1');
 await page.locator('#sides').selectOption('1');
 await expect(page.locator('#spine-width')).toHaveText('20.1');
 await page.locator('#undo').click();
 await expect(page.locator('#spine-width')).toHaveText('10.1');
 await page.locator('#frontTemplate').selectOption('classic');
 await page.locator('#layer-text').fill('테스트 표지');await page.locator('#layer-text').blur();
 await expect(page.locator('#cover-svg [data-layer="title"]')).toHaveText('테스트 표지');
 await page.evaluate(()=>{window.print=()=>{window.__printed=true;};});
 await page.locator('#print-cover').click();
 await expect.poll(()=>page.evaluate(()=>window.__printed)).toBe(true);
 await expect(page.locator('#print-output > svg')).toHaveAttribute('width','436.1mm');
 await expect(page.locator('#print-output .guide')).toHaveCount(0);
 // Verify the browser-generated PDF, rather than only checking the preview.
 const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true,displayHeaderFooter:false});
 const raw=pdf.toString('latin1');
 expect(raw.match(/\/Type\s*\/Page\b/g)?.length).toBe(1);
 const media=raw.match(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/);
 expect(media).not.toBeNull();
 expect(Math.abs(Number(media[1])-436.1*72/25.4)).toBeLessThan(2);
 expect(Math.abs(Number(media[2])-303*72/25.4)).toBeLessThan(2);
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
 await page.locator('#cover-order-file').setInputFiles({name:'cover.pdf',mimeType:'application/pdf',buffer:pdf});
 await expect(page).toHaveURL(/\/quote-book\.html#studio-handoff$/);await expect(page.locator('[data-studio-add]')).toBeEnabled();
 await page.locator('[data-studio-add]').click();await expect.poll(()=>page.locator('#quote-attachments').evaluate(e=>Array.from(e.files).map(f=>f.name))).toEqual(['cover.pdf']);
 await page.reload({waitUntil:'domcontentloaded'});await expect(page.locator('[data-studio-add]')).toBeEnabled();await page.locator('[data-studio-add]').click();await expect.poll(()=>page.locator('#quote-attachments').evaluate(e=>e.files.length)).toBe(1);
});

test('spine upright writing, nudge, delete and standalone covers',async({page})=>{
 await page.goto('/cover-studio.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#print-cover')).toBeEnabled();
 await page.locator('.layer-select').filter({hasText:'책등 ·'}).click();
 await expect(page.locator('#layer-writing')).toHaveValue('vertical');
 await page.locator('#layer-text').fill('책등문자');await page.locator('#layer-text').blur();
 const spine=page.locator('#cover-svg [data-layer="spine"]');
 await expect(spine.locator('tspan')).toHaveText(['책','등','문','자']);
 expect(await spine.getAttribute('transform')).toBeNull();
 const y=Number(await page.locator('#layer-y').inputValue());
 await page.getByRole('button',{name:'아래쪽 이동',exact:true}).click();
 expect(Number(await page.locator('#layer-y').inputValue())).toBeGreaterThan(y);
 await page.locator('#layer-writing').selectOption('rotated');
 await expect(spine).toHaveAttribute('transform',/^rotate\(90 /);
 await page.locator('#layer-writing').selectOption('vertical');
 await page.locator('#add-face').selectOption('spine');await page.locator('#add-text').click();
 await expect(page.locator('.layer-row')).toHaveCount(4);
 await page.locator('.layer-row').filter({hasText:'새 문구'}).locator('.layer-delete').click();
 await expect(page.locator('.layer-row')).toHaveCount(3);
 await page.locator('#undo').click();await expect(page.locator('.layer-row')).toHaveCount(4);
 await page.locator('#mode').selectOption('back');
 await expect(page.locator('#cover-dimensions')).toHaveText('216 × 303 mm (도련 포함)');
 await expect(page.locator('#spine-settings')).toBeHidden();
 await expect(page.locator('#cover-svg [data-layer]')).toHaveCount(0);
 await expect(page.locator('#add-face')).toHaveValue('back');
 await page.locator('#add-text').click();await expect(page.locator('.layer-select')).toContainText('뒷표지');
 await page.locator('#remove-text').click();await expect(page.locator('.layer-row')).toHaveCount(0);
 await page.locator('#mode').selectOption('front');
 await expect(page.locator('#cover-svg [data-layer]')).toHaveCount(2);
 await page.locator('#mode').selectOption('spread');
 await expect(page.locator('#cover-dimensions')).toHaveText('436 × 303 mm (도련 포함)');
 await expect(spine).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('cover canvas fills desktop viewport and all toolbar buttons fit sidebar',async({page})=>{
 await page.goto('/cover-studio.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#print-cover')).toBeEnabled();
 await expect(page.locator('.studio-heading')).toHaveCount(0);
 await expect(page.locator('.canvas-right #print-cover')).toBeVisible();
 const metrics=await page.evaluate(()=>{const stage=document.querySelector('#cover-stage'),panel=document.querySelector('.canvas-right'),r=panel.getBoundingClientRect();return {width:innerWidth,height:innerHeight,stage:stage.getBoundingClientRect().toJSON(),buttons:[...panel.querySelectorAll('.canvas-actions>*')].every(n=>{const b=n.getBoundingClientRect();return b.left>=r.left-1&&b.right<=r.right+1;}),overflow:document.documentElement.scrollWidth>innerWidth+2};});
 expect(metrics.buttons).toBe(true);expect(metrics.overflow).toBe(false);
 if(metrics.width>1050){expect(metrics.stage.top).toBeLessThan(110);expect(metrics.stage.height).toBeGreaterThan(metrics.height*.75);}
});
