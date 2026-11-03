import assert from 'node:assert/strict';
import test from 'node:test';
import { marketValueFixture } from './helpers/admin-market-value-page-fixture.mts';
test('auth error alongside owner user never reads protected market data',async()=>{
 const f=marketValueFixture({authError:true});
 const html=await f.render();
 assert.deepEqual(f.calls,[]);
 assert.doesNotMatch(html,/PRIVATE_AUTH_ERROR/);
 assert.match(html,/Entre como proprietário/);
});
test('owner email without verified application access never reads market data',async()=>{
 const f=marketValueFixture({user:{email:'owner@example.test'}});
 await assert.rejects(f.render(),/MARKET_DENIED/);
 assert.deepEqual(f.calls,[]);
});
test('verified owner still reads and renders real supplied records',async()=>{
 const f=marketValueFixture({state:'populated'});
 assert.match(await f.render(),/Synthetic Player/);
 assert.equal(f.calls.length,4);
});
