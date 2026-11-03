import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { runInNewContext } from 'node:vm';
import test from 'node:test';

function harness() {
  const source=readFileSync(new URL('../components/touchline/cards/TouchlineCardZoom.tsx',import.meta.url),'utf8');
  const start=source.indexOf('  function openFromCard(');
  const end=source.indexOf('  const replacementButton',start);
  assert.ok(start>=0 && end>start);
  const opened:boolean[]=[];
  const refs={pointerMovedRef:{current:false},pointerOriginRef:{current:null}};
  const cancel=source.match(/onPointerCancel=\{\(\) => \{([\s\S]*?)\}\}/)?.[1];
  const code=stripTypeScriptTypes(source.slice(start,end));
  const handlers=runInNewContext(code+`\n({openFromCard,rememberPointerOrigin,trackPointerMovement,openFromKeyboard,finishPointer:typeof finishPointer==='function'?finishPointer:()=>{},cancelPointer:typeof cancelPointer==='function'?cancelPointer:()=>{${cancel??''}}});`,{...refs,setIsOpen:(value:boolean)=>opened.push(value)});
  const pointer=(pointerId:number,isPrimary=true,x=0)=>({pointerId,isPrimary,clientX:x,clientY:0});
  const click=()=>handlers.openFromCard({target:{closest:()=>null},stopPropagation(){}});
  return {handlers,pointer,click,opened};
}
test('normal click opens; movement suppresses its synthesized click; subsequent new click works',()=>{
  const h=harness();
  h.handlers.rememberPointerOrigin(h.pointer(1));h.handlers.finishPointer(h.pointer(1));h.click();
  assert.equal(h.opened.length,1);
  h.handlers.rememberPointerOrigin(h.pointer(2));h.handlers.trackPointerMovement(h.pointer(2,true,20));h.handlers.finishPointer(h.pointer(2));h.click();
  assert.equal(h.opened.length,1);
  h.handlers.rememberPointerOrigin(h.pointer(3));h.handlers.finishPointer(h.pointer(3));h.click();
  assert.equal(h.opened.length,2);
});
test('second touch cannot reset movement suppression or open zoom from a synthesized click',()=>{
  const h=harness();
  h.handlers.rememberPointerOrigin(h.pointer(1));
  h.handlers.trackPointerMovement(h.pointer(1,true,20));
  h.handlers.rememberPointerOrigin(h.pointer(2,false,20));
  h.handlers.finishPointer(h.pointer(1));h.handlers.finishPointer(h.pointer(2,false));h.click();
  assert.equal(h.opened.length,0);
});
test('cancelled native gesture suppresses a trailing click without blocking a fresh tap or keyboard',()=>{
  const h=harness();
  h.handlers.rememberPointerOrigin(h.pointer(1));h.handlers.cancelPointer(h.pointer(1));h.click();
  assert.equal(h.opened.length,0);
  h.handlers.rememberPointerOrigin(h.pointer(2));h.handlers.finishPointer(h.pointer(2));h.click();
  assert.equal(h.opened.length,1);
  h.handlers.openFromKeyboard({key:'Enter',preventDefault(){},stopPropagation(){}});
  assert.equal(h.opened.length,2);
});

test('secondary contact whose primary finger is outside the card never arms the zoom',()=>{
  const h=harness();
  h.handlers.rememberPointerOrigin(h.pointer(2,false));h.handlers.finishPointer(h.pointer(2,false));h.click();
  assert.equal(h.opened.length,0);
  h.handlers.rememberPointerOrigin(h.pointer(3));h.handlers.finishPointer(h.pointer(3));h.click();
  assert.equal(h.opened.length,1);
});
test('multi-touch without initial movement also suppresses a trailing synthesized click',()=>{
  const h=harness();
  h.handlers.rememberPointerOrigin(h.pointer(1));h.handlers.rememberPointerOrigin(h.pointer(2,false));
  h.handlers.finishPointer(h.pointer(1));h.handlers.finishPointer(h.pointer(2,false));h.click();
  assert.equal(h.opened.length,0);
});
