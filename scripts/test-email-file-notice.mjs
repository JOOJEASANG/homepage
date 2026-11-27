import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
for(const path of ['quote-book.html','quote-print.html']){const s=readFileSync(path,'utf8');assert.ok(!s.includes('email-file-status'));assert.ok(!s.includes('data-email-copy'));}
for(const path of ['quote-book','quote-print','admin','mypage']){const s=readFileSync('assets/js/pages/'+path+'.js','utf8');assert.ok(!s.includes('email-file-notice.js'));assert.ok(!s.includes('emailFileStatus'));assert.ok(!s.includes('emailFileConfirmedAt'));}
console.log('Retired email receipt workflow: OK');
