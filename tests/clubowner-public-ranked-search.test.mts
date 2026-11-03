import assert from "node:assert/strict";
import test from "node:test";
import { projectPublicOwnerSearchPage } from "../lib/touchlineArena/clubowner-public-search.ts";
import { parsePublicOwnerSearchPage, parsePublicOwnerProfile, parseOwnPublicOwner, peopleCopy, publicOwnerNameMatchesQuery } from "../lib/touchlineArena/clubowner-public-contract.ts";
import { projectClubOwnerStandingIndex, projectClubOwnerStandingViews } from "../lib/touchlineArena/club-owner-standings.ts";
const uuid=(n:number)=>`${String(n).padStart(8,"0")}-1111-4111-8111-111111111111`;
const candidate=(n:number)=>({accountId:uuid(n),publicId:uuid(n+1000),displayName:`Public ${String(n).padStart(3,"0")}`,followerCount:n,following:false,viewer:"guest",email:"PRIVATE_EMAIL",internal:"PRIVATE_FIELD"});
const candidates=Array.from({length:47},(_,i)=>candidate(i+1));
const ranks=candidates.slice(0,45).map((row,i)=>({accountId:row.accountId,rank:45-i}));
test("initial pages follow actual ranking and stable ties, with unranked last and no internal identifiers",()=>{
 const first=projectPublicOwnerSearchPage(candidates,ranks,"",null); assert.equal(first.profiles.length,20);assert.equal(first.profiles[0].publicId,uuid(1045));
 const second=projectPublicOwnerSearchPage(candidates,ranks,"",first.nextCursor);const third=projectPublicOwnerSearchPage(candidates,ranks,"",second.nextCursor);
 assert.equal(third.nextCursor,null);assert.equal(third.profiles.length,7);assert.deepEqual(third.profiles.slice(-2).map(r=>r.rank),[null,null]);
 const all=[...first.profiles,...second.profiles,...third.profiles];assert.equal(new Set(all.map(r=>r.publicId)).size,47);
 assert.doesNotMatch(JSON.stringify(first),/PRIVATE_|accountId|email|touchlinePoints/);
 const tie=projectPublicOwnerSearchPage([candidate(2),candidate(1)], [{accountId:uuid(1),rank:1},{accountId:uuid(2),rank:1}],"",null);
 assert.deepEqual(tie.profiles.map(r=>r.publicId),[uuid(1001),uuid(1002)]);
});
test("name fragments search the complete published dataset and never match public/private IDs or wildcard syntax",()=>{
 for (const query of ["Public 001", "001", "001 public"]) {
  const result=projectPublicOwnerSearchPage(candidates,ranks,query,null);
  assert.equal(result.profiles.length,1); assert.equal(result.profiles[0].publicId,uuid(1001));
  assert.equal(result.profiles[0].rank,45, "matching a friend outside the initial page preserves the real rank");
 }
 for(const q of [uuid(1001).toUpperCase(),uuid(1),"Public%","Public_"])assert.deepEqual(projectPublicOwnerSearchPage(candidates,ranks,q,null).profiles,[]);
 for(const q of ["a","  ","\u0301\u0300","mail@example.test","a".repeat(81)])assert.throws(()=>projectPublicOwnerSearchPage(candidates,ranks,q,null));
});
test("name matching is accent/case insensitive, literal and requires every supplied word",()=>{
 const names=[{...candidate(1),displayName:"João da Silva"},{...candidate(2),displayName:"Maria da Silva"},{...candidate(3),displayName:"João da Costa"}];
 for(const q of ["silva joao", "SÍLVA   JOÃ", "ao da sil"]) {
  const result=projectPublicOwnerSearchPage(names,ranks,q,null);assert.deepEqual(result.profiles.map(row=>row.publicId),[uuid(1001)]);
 }
 assert.equal(projectPublicOwnerSearchPage(names,ranks,"silva",null).profiles.length,2);
 assert.equal(projectPublicOwnerSearchPage(names,ranks,"joao maria",null).profiles.length,0);
 assert.equal(publicOwnerNameMatchesQuery("Luiz 100%", "100%"),true);
 assert.equal(publicOwnerNameMatchesQuery("Luiz 100", "100%"),false);
 for(const locale of ["pt-BR","en-GB"] as const){const copy=peopleCopy(locale);assert.doesNotMatch([copy.introduction,copy.query,copy.queryHelp,copy.limit,copy.invalid].join(" "),/\bID\b/);}
});
test("cursor is bounded and bound to query and publication/ranking snapshot, never silently stale",()=>{
 const first=projectPublicOwnerSearchPage(candidates,ranks,"",null);const token=JSON.parse(Buffer.from(first.nextCursor!,"base64url").toString());
 const encode=(value:unknown)=>Buffer.from(JSON.stringify(value)).toString("base64url");
 for(const bad of ["!","a".repeat(1025),encode({...token,offset:-20}),encode({...token,offset:1}),encode({...token,offset:100000}),encode({...token,extra:"data"}),encode({...token,query:"else"})])assert.throws(()=>projectPublicOwnerSearchPage(candidates,ranks,"",bad),/PEOPLE_INVALID_CURSOR/);
 assert.throws(()=>projectPublicOwnerSearchPage(candidates.slice(1),ranks,"",first.nextCursor),/PEOPLE_INVALID_CURSOR/);
 assert.throws(()=>projectPublicOwnerSearchPage(candidates,ranks.map(r=>({...r,rank:r.rank+1})),"",first.nextCursor),/PEOPLE_INVALID_CURSOR/);
 assert.throws(()=>projectPublicOwnerSearchPage(candidates,ranks,"Public",first.nextCursor),/PEOPLE_INVALID_CURSOR/);
 assert.equal(projectPublicOwnerSearchPage(candidates.map(r=>({...r,followerCount:r.followerCount+1})),ranks,"",first.nextCursor).profiles.length,20);
 const named=projectPublicOwnerSearchPage(candidates,ranks,"púBlic",null);
 assert.equal(projectPublicOwnerSearchPage(candidates,ranks,"PUBLIC",named.nextCursor).profiles.length,20);
 assert.throws(()=>projectPublicOwnerSearchPage(candidates,ranks,"pub",named.nextCursor),/PEOPLE_INVALID_CURSOR/);
});
test("malformed/duplicate or over-cap inputs fail closed; DTO strips unknowns and rejects invalid ranks",()=>{
 for(const rows of [[candidate(1),candidate(1)],[{...candidate(1),accountId:"bad"}],Array(10001).fill(candidate(1))])assert.throws(()=>projectPublicOwnerSearchPage(rows,ranks,"",null));
 for(const index of [[{accountId:uuid(1),rank:0}], [{accountId:uuid(1),rank:NaN}], [{accountId:uuid(1),rank:1},{accountId:uuid(1),rank:2}]])assert.throws(()=>projectPublicOwnerSearchPage(candidates,index,"",null));
 for(const rank of [0,-1,"1",NaN])assert.throws(()=>parsePublicOwnerSearchPage({profiles:[{...candidate(1),rank}],nextCursor:null}));
 const parsed=parsePublicOwnerSearchPage({profiles:[{...candidate(1),rank:1}],nextCursor:null,secret:"hidden"});
 assert.doesNotMatch(JSON.stringify(parsed),/accountId|secret|PRIVATE_/);
});
test("ranking join uses account UUID despite equal public names; index agrees with existing FINAL-only ranking",()=>{
 const weeks=[{id:"a",user_id:uuid(1),market_plan_key_snapshot:"vip",users:{full_name:"Same"},touchline_fantasy_user_gameweek_scores:{gameweek_score:7,settlement_status:"FINAL"}},{id:"b",user_id:uuid(2),market_plan_key_snapshot:"vip",users:{full_name:"Same"},touchline_fantasy_user_gameweek_scores:{gameweek_score:999,settlement_status:"PROVISIONAL"}}];
 const index=projectClubOwnerStandingIndex(weeks)!;assert.deepEqual(index.map(r=>r.rank),projectClubOwnerStandingViews(weeks)!.rows.map(r=>r.rank));
 const result=projectPublicOwnerSearchPage([candidate(2),candidate(1)].map(r=>({...r,displayName:"Same Public"})),index,"",null);
 assert.deepEqual(result.profiles.map(r=>[r.publicId,r.rank]),[[uuid(1001),1],[uuid(1002),2]]);
 assert.doesNotMatch(JSON.stringify(projectClubOwnerStandingViews(weeks)),/accountId|user_id/);
});

test("public plans are enum-only and current-plan changes invalidate continuation without disclosing billing",()=>{
 for(const planKey of ["beta","standard","master","vip",null]){
  const dto=projectPublicOwnerSearchPage([{...candidate(1),planKey,balance:999,provider_customer_reference:"SECRET"}],[],"",null).profiles[0];
  assert.equal(dto.planKey,planKey);assert.doesNotMatch(JSON.stringify(dto),/balance|SECRET|provider|accountId/);
 }
 assert.equal(parsePublicOwnerProfile(candidate(1))!.planKey,null,"older deployments must be neutral, never inferred Beta");
 for(const planKey of ["pro","paid","VIP",{},42])assert.throws(()=>parsePublicOwnerProfile({...candidate(1),planKey}),/INVALID_PUBLIC_PLAN/);
 assert.equal(Object.hasOwn(parseOwnPublicOwner({...candidate(1),published:false,planKey:"vip"})!,"planKey"),false,"private own-profile projection does not expose a plan");
 const first=projectPublicOwnerSearchPage(candidates,ranks,"",null);
 assert.throws(()=>projectPublicOwnerSearchPage(candidates.map((r,i)=>({...r,planKey:i===0?"vip":null})),ranks,"",first.nextCursor),/PEOPLE_INVALID_CURSOR/);
});
