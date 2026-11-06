import test from "node:test";
import assert from "node:assert/strict";
import { touchLinePlayerFixtureSupplementaryStatistics as derive } from "../lib/football-data/player-fixture-supplementary-statistics.ts";
const base={position:'Defender',appearanceStatus:'started',minutesPlayed:90,teamGoalsConceded:0,statistics:{'tackles-won':2,interceptions:2,clearances:3,'blocked-shots':1,'aeriels-won':1}};
test('derives CS and DEF without rating or ranking points',()=>{
 assert.deepEqual(derive(base),{'clean-sheets':1,'defensive-actions-total':9,'def-score':1});
 assert.equal(derive({...base,teamGoalsConceded:2})['clean-sheets'],0);
 assert.equal(derive({...base,position:'Goalkeeper'})['def-score'],undefined);
});
test('missing and invalid facts never become zeros',()=>{
 assert.deepEqual(derive({...base,statistics:{},teamGoalsConceded:null}),{});
 assert.equal(derive({...base,statistics:{...base.statistics,clearances:NaN}})['def-score'],undefined);
 assert.equal(derive({...base,teamGoalsConceded:-1})['clean-sheets'],undefined);
});
test('nonparticipants never earn auxiliary statistics',()=>{
 assert.deepEqual(derive({...base,minutesPlayed:0}),{});
 assert.deepEqual(derive({...base,appearanceStatus:'absent'}),{});
});
test('known zero defensive actions remain an actual zero',()=>{
 assert.equal(derive({...base,statistics:{'tackles-won':0,interceptions:0,clearances:0,'shots-blocked':0,'aerials-won':0}})['def-score'],0);
});
