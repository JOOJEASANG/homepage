import {test,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PDFDocument} from 'pdf-lib';
async function routeExport(page){await page.context().route('https://cdn.jsdelivr.net/npm/pdf-lib@1.17.1/dist/pdf-lib.esm.min.js',route=>route.fulfill({body:readFileSync(resolve('node_modules/pdf-lib/dist/pdf-lib.esm.min.js')),contentType:'application/javascript',headers:{'access-control-allow-origin':'*'}}));}
test('local layout image, repeat, roll folds and reverse side',async({page})=>{
 await routeExport(page);
 await page.goto('/layout-studio.html',{waitUntil:'domcontentloaded'});
 await expect(page.locator('#layout-dimensions')).toHaveText('330 × 480 mm · 2개 배치');
 await page.locator('#fold').selectOption('roll');
 await expect(page.locator('#panel-widths')).toHaveText('1면 100mm / 2면 100mm / 3면 97mm');
 await page.locator('#face-back').click();
 await expect(page.locator('#panel-widths')).toHaveText('1면 97mm / 2면 100mm / 3면 100mm');
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=600;c.height=400;const x=c.getContext('2d');x.fillStyle='green';x.fillRect(0,0,600,400);return c.toDataURL().split(',')[1];});
 await page.locator('#file-front').setInputFiles({name:'front.png',mimeType:'image/png',buffer:Buffer.from(image,'base64')});
 await expect(page.locator('#source-summary')).toContainText('front.png');
 await expect(page.locator('#layout-svg image')).toHaveCount(2);
 await expect(page.locator('#layout-warning')).toContainText('도련 영역');
 await page.locator('#fit').selectOption('bleed');
 await expect(page.locator('#layout-warning')).toContainText('확대/축소');
 await page.locator('#face-back').click();await expect(page.locator('#layout-svg image')).toHaveCount(0);
 const download=page.waitForEvent('download');await page.locator('#layout-export').click();
 const output=await PDFDocument.load(readFileSync(await (await download).path()));
 expect(output.getPageCount()).toBe(1);expect(output.getPage(0).getWidth()).toBeCloseTo(330*72/25.4,3);expect(output.getPage(0).getHeight()).toBeCloseTo(480*72/25.4,3);
 await page.locator('#rows').fill('3');await page.locator('#rows').blur();
 await expect(page.locator('#layout-warning')).toContainText('벗어납니다');
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+2)).toBe(true);
});

test('PDF preview uses the real pinned PDF.js engine and independent page sides',async({page})=>{
 await routeExport(page);
 // Generate a genuine two-page PDF using Chromium; use the exact pinned engine from npm.
 await page.setContent('<style>@page{size:297mm 210mm;margin:0}html,body{margin:0}.sheet{height:209mm;break-after:page}.sheet:last-child{break-after:auto}</style><div class="sheet">FRONT</div><div class="sheet">BACK</div>');
 const pdf=await page.pdf({preferCSSPageSize:true,printBackground:true});
 await page.context().route('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/**',route=>{
   const prefix='https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/';
   const path=route.request().url().slice(prefix.length);
   if(!/^(build\/pdf(?:\.worker)?\.min\.mjs|cmaps\/[\w.-]+|standard_fonts\/[\w.-]+)$/.test(path))return route.abort();
   return route.fulfill({body:readFileSync(resolve('node_modules/pdfjs-dist',path)),contentType:path.endsWith('.mjs')?'application/javascript':'application/octet-stream',headers:{'access-control-allow-origin':'*'}});
 });
 await page.goto('/layout-studio.html',{waitUntil:'domcontentloaded'});
 await page.locator('#file-front').setInputFiles({name:'sample.pdf',mimeType:'application/pdf',buffer:pdf});
 await expect(page.locator('#source-summary')).toContainText('1/2페이지',{timeout:15000});
 await expect(page.locator('#layout-svg image')).toHaveCount(2);
 await page.locator('#same-pdf-back').click();
 await expect(page.locator('#source-summary')).toContainText('2/2페이지');
 await page.locator('#face-front').click();
 await expect(page.locator('#source-summary')).toContainText('1/2페이지');
 const download=page.waitForEvent('download');await page.locator('#layout-export').click();
 const bytes=readFileSync(await (await download).path()),output=await PDFDocument.load(bytes);
 expect(output.getPageCount()).toBe(2);expect(output.getPage(0).getWidth()).toBeCloseTo(330*72/25.4,3);expect(output.getPage(1).getHeight()).toBeCloseTo(480*72/25.4,3);
 const words=await page.evaluate(async data=>{const pdf=await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');const doc=await pdf.getDocument({data:new Uint8Array(data),isEvalSupported:false}).promise;try{return await Promise.all([1,2].map(async n=>(await (await doc.getPage(n)).getTextContent()).items.map(x=>x.str).join(' ')));}finally{await doc.destroy();}},Array.from(bytes));
 expect(words[0]).toContain('FRONT');expect(words[1]).toContain('BACK');
});
