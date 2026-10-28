import assert from "node:assert/strict";
import test from "node:test";
import { randomUUID } from "node:crypto";
import { legacyCoachCatalogue, UNAVAILABLE_COACH_CATALOGUE, parseCoachCatalogue, parseCoachCatalogueTransport, catalogueCoachForId, catalogueCoachForTeam, catalogueCoachAssignments } from "../lib/touchlineArena/coach-catalogue-contract.ts";
import { selectTouchlineCoachTierRepresentativesFromRanking } from "../lib/touchlineArena/clubhub-tier-showcase.ts";
const raw = () => { const rows = legacyCoachCatalogue().current.map(e=>({ id:randomUUID(),publicationId:randomUUID(),providerId:e.coach.providerId,teamId:e.coach.teamId,name:e.coach.name,
  nationality:e.coach.nationality,countryId:e.coach.countryId,countryCode3:e.countryCode3,sourceKind:"legacy_seed_bootstrap",observedAt:e.fetchedAt,classification:e.classification }));return {revision:1,current:rows,history:[...rows]}; };
test("catalogue read failures, partial data and unknown IDs never return legacy seed authority",()=>{
  for(const value of [null,{}, {revision:1,current:[],history:[]}, {...raw(),current:raw().current.slice(1)}])assert.equal(parseCoachCatalogue(value).phase,"unavailable");
  assert.equal(catalogueCoachForId(UNAVAILABLE_COACH_CATALOGUE,"307"),null);assert.equal(catalogueCoachForTeam(UNAVAILABLE_COACH_CATALOGUE,"19"),null);assert.throws(()=>catalogueCoachAssignments(UNAVAILABLE_COACH_CATALOGUE),/UNAVAILABLE/);
  const ranking={phase:"unavailable" as const,snapshotId:null,seasonId:null,scoringVersion:null,fixtureIds:[],generatedAt:null,rows:[],catalogue:UNAVAILABLE_COACH_CATALOGUE};
  assert.ok(selectTouchlineCoachTierRepresentativesFromRanking(ranking).every(item=>item.snapshot===null));
});
test("catalogue maintains historical identity and supplies every approved ID to fixture reconciliation",()=>{
  const data=raw(),old=data.current[0],next={...old,id:randomUUID(),publicationId:randomUUID(),providerId:"999999",name:old.name,classification:{...old.classification,coachProviderId:"999999"}};
  data.current[0]=next;data.history.push(next);const catalogue=parseCoachCatalogue(data);assert.equal(catalogue.phase,"ready");
  assert.equal(catalogueCoachForId(catalogue,old.providerId)?.internalId,old.id);assert.equal(catalogueCoachForTeam(catalogue,old.teamId)?.coach.providerId,"999999");
  assert.equal(catalogueCoachAssignments(catalogue).length,21);assert.equal(catalogueCoachForId(catalogue,old.name),null);
  assert.deepEqual(parseCoachCatalogueTransport(JSON.parse(JSON.stringify(catalogue))),catalogue);
  assert.deepEqual(parseCoachCatalogueTransport(legacyCoachCatalogue()),legacyCoachCatalogue());
});
test("catalogue rejects duplicate current identities and mismatched immutable versions",()=>{
  const data=raw();data.current[0]={...data.current[0],providerId:data.current[1].providerId};assert.equal(parseCoachCatalogue(data).phase,"unavailable");
  const version=raw();version.current[0]={...version.current[0],name:"different"};assert.equal(parseCoachCatalogue(version).phase,"unavailable");
});
