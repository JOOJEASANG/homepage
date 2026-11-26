import assert from 'node:assert/strict';
import {getDigitalPrintSizeMultiplier as size, nearestDigitalPrintFormat as nearest} from '../assets/js/pages/quote-print/size-calculator.js';
const cfg={minMultiplier:.6,multipliers:{A3:2.25,A4:1.1,A5:.65,B5:.72}};
for(const preset of ['A3','B4','IN12x18','IN13x19']) assert.equal(size(preset,0,0,cfg),2.25,preset);
for(const preset of ['A5','B5','A4']) assert.equal(size(preset,0,0,cfg),1.1,preset);
for(const [w,h,format] of [[148,210,'A5'],[150,212,'A5'],[182,257,'B5'],[180,260,'B5'],[210,297,'A4'],[215,300,'A4'],[211,297,'A4'],[210,298,'A4'],[257,364,'B4'],[260,360,'B4'],[297,420,'A3'],[300,400,'A3'],[330,480,'A3'],[482,330,'A3']]){
  assert.equal(nearest('CUSTOM',w,h),format);assert.equal(nearest('CUSTOM',h,w),format);
  assert.equal(size('CUSTOM',w,h,cfg),size(format,0,0,cfg));
}
assert.equal(size('CUSTOM',0,330,cfg),0);
for(const dims of [[483,330],[482,331],[331,482]]) assert.throws(()=>size('CUSTOM',...dims,cfg),/최대 사이즈/);
console.log('digital print nearest format and A3 cap passed');
