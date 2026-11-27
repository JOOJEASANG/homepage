import assert from 'node:assert/strict';
import {centeredPlacement} from '../assets/js/pages/print-studio/layout-export.js';
import {layoutGeometry,foldPanels,sourcePlacement} from '../assets/js/pages/print-studio/layout-model.js';
const s={sheetW:330,sheetH:480,trimW:297,trimH:210,bleed:3,margin:5,cols:1,rows:2,gapX:3,gapY:3,edge:3,fold:'roll',direction:'right',compensation:3};
const g=layoutGeometry(s);assert.equal(g.cells.length,2);assert.equal(g.usedW,303);assert.equal(g.usedH,435);assert.deepEqual(g.panels,[100,100,97]);assert.deepEqual(layoutGeometry(s,true).panels,[97,100,100]);assert.deepEqual(foldPanels(297,'half'),[148.5,148.5]);assert.deepEqual(foldPanels(297,'z'),[99,99,99]);assert.equal(g.warnings.length,0);
assert.match(layoutGeometry({...s,rows:3}).warnings[0],/벗어/);
assert.equal(sourcePlacement({w:303,h:216},g,'actual',0).bleedCovered,true);
assert.equal(sourcePlacement({w:297,h:210},g,'actual',0).bleedCovered,false);
assert.equal(sourcePlacement({w:216,h:303},g,'actual',90).bleedCovered,true);
assert.ok(Math.abs(sourcePlacement({w:297,h:210,pixels:{w:2970,h:2100}},g,'actual',0).dpi-254)<1e-9);
assert.throws(()=>layoutGeometry({...s,cols:1.5}),/정수/);
console.log('layout geometry, folds, reverse faces, bleed and raster DPI passed');

for(const angle of [0,90,180,270,360,450]){const c={x:10,y:20,w:100,h:80},p={w:70,h:50};const r=centeredPlacement(c,200,p,angle),t=r.angle*Math.PI/180;assert.ok(Math.abs(r.x+(Math.cos(t)*r.width-Math.sin(t)*r.height)/2-60*72/25.4)<1e-8);assert.ok(Math.abs(r.y+(Math.sin(t)*r.width+Math.cos(t)*r.height)/2-140*72/25.4)<1e-8);}
