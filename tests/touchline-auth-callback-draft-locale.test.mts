import assert from 'node:assert/strict';
import test from 'node:test';
import {resolveTouchLineAuthCallbackDestination} from '../lib/server/auth-callback-destination.ts';

const resolve:(next:string|null|undefined,origin:string,draft?:boolean)=>URL=resolveTouchLineAuthCallbackDestination;
const origin='https://touchline.example';
const locales=['en-GB','pt-BR','es-ES','it-IT','fr-FR','ar-SA','tr-TR','de-DE'];

test('callback trusted opt-in preserves eight locales through retired destination migration',()=>{
  for(const locale of locales)for(const draft of [false,true]){
    const expected=draft?locale:locale==='pt-BR'?'pt-BR':'en-GB';
    for(const path of ['/arena/bench','/club-owner/foreign/substitution']){
      const destination=resolve(`${path}?lang=${locale}&owner=foreign#old`,origin,draft);
      assert.equal(destination.href,`${origin}/clubowner?lang=${expected}`);
      assert.equal(destination.origin,origin);
      assert.equal(resolve(`${origin}${path}?lang=${locale}`,origin,draft).href,`${origin}/clubowner?lang=${expected}`);
    }
  }
});

test('callback query is never an opt-in authority; default behavior and recovery remain compatible',()=>{
  assert.equal(resolve('/arena?lang=ar-SA&draftLocalesEnabled=true',origin).href,`${origin}/clubowner?lang=en-GB`);
  assert.equal(resolve('/arena?lang=ar-SA&draftLocalesEnabled=true',origin,false).href,`${origin}/clubowner?lang=en-GB`);
  for(const draft of [false,true])for(const path of ['/reset-password?lang=ar-SA&code=opaque#recovery','/my-club?lang=ar-SA#identity','/admin/finance?lang=pt-BR','/clubowner?lang=fr-FR&contractPlayer=10','/arena?lang=ar-SA&intro=first']){
    let expected=path.startsWith('/arena?')?path.replace('/arena?','/intro?'):path;
    if(!draft && !path.startsWith('/reset-password')) expected=expected.replace(/lang=(ar-SA|fr-FR)/,'lang=en-GB');
    assert.equal(resolve(path,origin,draft).href,`${origin}${expected}`);
  }
});

test('callback rejects unsafe origins and unsupported destinations regardless of presentation gate',()=>{
  for(const draft of [false,true])for(const next of [undefined,null,'','https://evil.test/arena?lang=ar-SA','//evil.test/arena','/\\evil.test/arena','https://touchline.example.evil.test/arena','https://touchline.example@evil.test/arena','javascript:alert(1)','/login?lang=ar-SA','/arena\n?lang=ar-SA','/arena\u007f','http://[']){
    const destination=resolve(next,origin,draft);
    assert.equal(destination.href,`${origin}/clubowner`);assert.equal(destination.origin,origin);
  }
});
