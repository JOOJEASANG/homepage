import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GUIDE_DETAILS, normalizeGuideTitle, getGuideDetail, renderGuideDetails } from '../assets/js/pages/work-guide/guide-details.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

assert.equal(GUIDE_DETAILS.length, 12, '12 production subjects are documented');
assert.equal(new Set(GUIDE_DETAILS.map(guide => guide.title)).size, 12);
assert.equal(normalizeGuideTitle('01. 파일 접수 기본 안내'), '파일 접수 기본 안내');
for (const item of GUIDE_DETAILS) {
  assert.ok(getGuideDetail(item.title));
  assert.equal(getGuideDetail('01. ' + item.title).title, item.title);
  assert.ok(item.steps.length >= 4, item.title + ': steps');
  assert.ok(item.checks.length >= 4, item.title + ': checks');
  assert.ok(item.example.length > 70, item.title + ': detailed example');
  assert.match(renderGuideDetails('01. ' + item.title), /실무 예시/);
  assert.match(renderGuideDetails(item.title), /접수 전 상세 점검/);
}
assert.equal(getGuideDetail('개별 작성한 안내'), null);
assert.equal(renderGuideDetails('개별 작성한 안내'), '');
assert.match(renderGuideDetails('04. 여백·도련·재단선 안내'), /216×303mm/);
assert.match(renderGuideDetails('09. 디지털 인쇄 기본 안내'), /200면/);

const guidePage = read('work-guide.html');
const script = read('assets/js/pages/work-guide.js');
const styles = read('assets/css/work-guide-v3.css');
const admin = read('admin.html');
const seed = read('admin-work-guides-seed.html');
for (const id of ['guideSearch','guideFilters','guideResultCount','viewSummary','viewCategory','guidePrev','guideNext']) {
  assert.match(guidePage, new RegExp('id="' + id + '"'));
}
assert.match(guidePage, /assets\/css\/work-guide-v3\.css/);
assert.match(admin, /assets\/css\/work-guide-v3\.css/);
assert.match(styles, /@media \(max-width: 767px\)/);
assert.match(styles, /height: calc\(100dvh - 36px\)/, 'desktop dialog should fill remaining viewport height');
assert.doesNotMatch(styles, /min\(92dvh, 920px\)/, 'fixed 920px cap must not leave a large bottom gap');
assert.doesNotMatch(guidePage, /md:h-\[85vh\]/, 'legacy modal height limit should be removed');
assert.match(styles, /#workGuideModal #guideViewer \{ min-height: 0;/, 'viewer must shrink to allow internal scrolling');
assert.match(script, /renderGuideDetails\(guide\.title\)/);
assert.match(script, /guideVersion: 3/);
assert.match(script, /filteredGuides\(\)/);
assert.match(script, /filteredGuides\(\)/);
assert.match(seed, /renderGuideDetails\(g\.title\)/);
assert.match(seed, /guideVersion:3/);
console.log('Work guide layout, filters and twelve enriched articles: OK');
