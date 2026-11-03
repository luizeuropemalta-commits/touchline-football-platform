import assert from 'node:assert/strict';import test from 'node:test';import {readFileSync} from 'node:fs';import vm from 'node:vm';import ts from 'typescript';
function setup(){
 const source=readFileSync(new URL('../components/touchline/ClubHubFixtureStrip.tsx',import.meta.url),'utf8');
 const start=source.indexOf('  useEffect(() => {',source.indexOf('// Observe interaction even before'));
 const end=source.indexOf('  }, []);',start)+'  }, []);'.length;
 const node=new EventTarget() as EventTarget&{parentElement:EventTarget};node.parentElement=new EventTarget();const win=new EventTarget();
 const interaction={current:{touching:false,hovered:false,resumeAfter:0}};let cleanup=()=>{};let notifications=0;
 vm.runInNewContext(ts.transpileModule(source.slice(start,end),{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText,{useEffect:(fn:()=>()=>void)=>{cleanup=fn();},viewport:{current:node},window:win,performance:{now:()=>100},interaction,synchronizeMotion:{current:()=>notifications++}});
 const emit=(type:string,pointerId:number)=>{const event=Object.assign(new Event(type),{pointerId,pointerType:'touch'});(type==='pointerdown'?node.parentElement:win).dispatchEvent(event);};
 return{interaction,emit,cleanup,notifications:()=>notifications};
}
test('carousel keeps pause until every tracked finger is released and ignores unrelated pointerup',()=>{
 const s=setup();s.emit('pointerdown',1);s.emit('pointerdown',2);assert.equal(s.interaction.current.touching,true);
 s.emit('pointerup',99);assert.equal(s.interaction.current.touching,true);
 s.emit('pointerup',1);assert.equal(s.interaction.current.touching,true);assert.equal(s.interaction.current.resumeAfter,0);
 s.emit('pointercancel',2);assert.equal(s.interaction.current.touching,false);assert.equal(s.interaction.current.resumeAfter,2600);
 s.cleanup();const before=s.notifications();s.emit('pointerdown',3);assert.equal(s.notifications(),before);
});
