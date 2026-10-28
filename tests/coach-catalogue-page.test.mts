import assert from "node:assert/strict";
import test from "node:test";
import { coachPageFixture, coachEditorialFixtureState } from "./helpers/coach-catalogue-page-fixture.mts";
for(const locale of ["pt-BR","en-GB"]){
  test(`coach Admin ${locale}: real SSR renders IDs, origin, pending review and gated public state`,async()=>{
    const f=coachPageFixture(),html=await f.render(locale);assert.equal(f.reads(),1);assert.match(html,/Synthetic New Coach/);assert.match(html,/99991/);assert.match(html,/Mikel Arteta/);assert.match(html,/sportmonks\.fixture\.coaches/);assert.match(html,/9990001/);assert.match(html,locale==="pt-BR"?/Aprovar revisão/:/Approve review/);assert.doesNotMatch(html,/Publicar associação atual|Publish current appointment/);assert.doesNotMatch(html,/actor_id|service_role|PRIVATE_DB/);
  });
  test(`coach Admin ${locale}: OFF performs no data read and errors are not presented as empty success`,async()=>{
    const off=coachPageFixture({enabled:false}),html=await off.render(locale);assert.equal(off.reads(),0);assert.match(html,locale==="pt-BR"?/Catálogo dinâmico desligado/:/Dynamic catalogue disabled/);assert.doesNotMatch(html,/Synthetic New Coach/);
    const error=await coachPageFixture({error:true}).render(locale);assert.match(error,/role="alert"/);assert.doesNotMatch(error,/PRIVATE_DB_FAILURE|Nenhuma mudança|No coach changes/);
  });
  test(`coach Admin ${locale}: empty and approved states are explicit`,async()=>{
    const empty=await coachPageFixture({state:{revision:0,currentCount:0,publicEnabled:false,candidates:[]}}).render(locale);assert.match(empty,locale==="pt-BR"?/Importar os 20 registros legados/:/Import the 20 legacy entries/);
    const approved=await coachPageFixture({state:{...coachEditorialFixtureState,candidates:coachEditorialFixtureState.candidates.map(c=>({...c,status:"approved"}))}}).render(locale);assert.match(approved,locale==="pt-BR"?/Publicar associação atual/:/Publish current appointment/);
  });
}
test("coach Admin denies non-owner and denied-access actors before any catalogue read",async()=>{for(const options of [{owner:false},{allowed:false}]){const f=coachPageFixture(options);await assert.rejects(f.render(),/ACCESS_DENIED/);assert.equal(f.reads(),0);}});
