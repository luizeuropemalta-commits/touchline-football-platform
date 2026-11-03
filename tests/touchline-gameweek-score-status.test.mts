import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { needsLineupReconfirmation, presentGameweekScore, projectGameweekScoreStatus } from "../lib/touchlineFantasy/gameweek-score-status.ts";
import { getGameweekScoreStatusCopy } from "../lib/touchlineFantasy/gameweek-score-status-i18n.ts";

test("a rejected or absent XI after lock is not presented as an earned zero", () => {
  for (const gameweekState of ["LOCKED", "LIVE", "FINAL", "SETTLED"]) {
    for (const userGameweekState of [null, "DRAFT"]) {
      const status = projectGameweekScoreStatus({gameweekState,userGameweekState,scoreRow:null});
      assert.equal(status,"NO_VALID_LINEUP");
      assert.deepEqual(presentGameweekScore(status,0),{status,value:null});
    }
  }
});

test("future and open drafts are not ineligible; confirmed XI awaits kickoff", () => {
  for (const gameweekState of ["UPCOMING","MARKET_OPEN"]) {
    for (const userGameweekState of [null,"DRAFT"]) {
      assert.equal(projectGameweekScoreStatus({gameweekState,userGameweekState,scoreRow:null}),"AWAITING_CONFIRMATION");
    }
    assert.equal(projectGameweekScoreStatus({gameweekState,userGameweekState:"CONFIRMED",scoreRow:null}),"AWAITING_KICKOFF");
  }
  assert.equal(projectGameweekScoreStatus({gameweekState:null,userGameweekState:null,scoreRow:null}),"NO_GAMEWEEK");
});

test("lock and score workers pending are distinct from an invalid XI", () => {
  for (const userGameweekState of ["CONFIRMED","LOCKED","FINAL"]) {
    assert.equal(projectGameweekScoreStatus({gameweekState:"LIVE",userGameweekState,scoreRow:null}),"PENDING_SCORE");
  }
  assert.equal(projectGameweekScoreStatus({gameweekState:"LIVE",userGameweekState:"DRAFT",scoreRow:{gameweek_score:19,settlement_status:"FINAL"}}),"UNAVAILABLE","contradictory evidence is not an eligibility decision");
});

test("verified zero remains zero; provider revision is displayed by replacement", () => {
  for (const settlement_status of ["PROVISIONAL","FINAL"] as const) {
    for (const gameweek_score of [0,"0",7.19,7.02]) {
      const status = projectGameweekScoreStatus({gameweekState:"LIVE",userGameweekState:"LOCKED",scoreRow:{gameweek_score,settlement_status}});
      assert.deepEqual(presentGameweekScore(status,Number(gameweek_score)),{status:settlement_status,value:Number(gameweek_score)});
    }
  }
});

test("read failures and missing or malformed scores cannot become zero or no-valid-XI", () => {
  for (const userGameweekState of [null,"DRAFT","LOCKED","FINAL"]) {
    assert.equal(projectGameweekScoreStatus({gameweekState:"LIVE",userGameweekState,scoreRow:null,readFailed:true}),"UNAVAILABLE");
  }
  for (const gameweek_score of [null,undefined,"",NaN,Infinity,-1]) {
    assert.equal(projectGameweekScoreStatus({gameweekState:"LIVE",userGameweekState:"LOCKED",scoreRow:{gameweek_score,settlement_status:"FINAL"}}),"UNAVAILABLE");
  }
  assert.deepEqual(presentGameweekScore(undefined,0),{status:"UNAVAILABLE",value:null},"older snapshots need an explicit status after refresh");
  assert.deepEqual(presentGameweekScore("UNAVAILABLE",41.19),{status:"UNAVAILABLE",value:null});
  assert.deepEqual(presentGameweekScore("FINAL",NaN),{status:"UNAVAILABLE",value:null});
  assert.deepEqual(presentGameweekScore("UNKNOWN" as never,41.19),{status:"UNAVAILABLE",value:null});
});

test("reconfirmation warning requires a known changed confirmation in an open round", () => {
  const input = {roundEditable:true,userGameweekState:"CONFIRMED",hasUnsavedChanges:true,collectionKnown:true,scoreStatus:"AWAITING_KICKOFF" as const};
  assert.equal(needsLineupReconfirmation(input),true);
  for (const overrides of [{roundEditable:false},{userGameweekState:"DRAFT"},{userGameweekState:"LOCKED"},{hasUnsavedChanges:false},{collectionKnown:false},{scoreStatus:"UNAVAILABLE" as const}]) {
    assert.equal(needsLineupReconfirmation({...input,...overrides}),false);
  }
});

test("status copy is complete in all supported locales without changing locale release gates", () => {
  const en = getGameweekScoreStatusCopy("en-GB");
  for (const locale of ["en-GB","pt-BR","es-ES","it-IT","fr-FR","ar-SA","tr-TR","de-DE"]) {
    const copy = getGameweekScoreStatusCopy(locale,true);
    assert.deepEqual(Object.keys(copy),Object.keys(en));
    assert.ok(Object.values(copy).every(text=>text.trim().length>0));
    if (!["en-GB","pt-BR"].includes(locale)) assert.equal(getGameweekScoreStatusCopy(locale),en);
  }
  assert.match(getGameweekScoreStatusCopy("pt-BR").reconfirm,/Confirme o XI novamente/);
});


test("the real failed-poll handler invalidates round evidence without erasing season points", () => {
  const source = readFileSync(new URL("../app/fantasy/FantasyGameweekClient.tsx",import.meta.url),"utf8");
  const ast = ts.createSourceFile("Fantasy.tsx",source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
  let initializer = "";
  function visit(node:ts.Node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(ast) === "invalidateIndicators") initializer = node.initializer!.getText(ast);
    ts.forEachChild(node,visit);
  }
  visit(ast); assert.ok(initializer);
  const script = ts.transpileModule(`(${initializer})()`,{compilerOptions:{target:ts.ScriptTarget.ES2022}}).outputText;
  for (const disposed of [false,true]) {
    const before = {gameweekScoreStatus:"PROVISIONAL",gameweekScore:41.19,seasonScore:82.5,qaClubMarketOpen:true,matchCardIndicators:[],playerAvailabilityIndicators:[]};
    let state = before;
    runInNewContext(script,{disposed,setLive:(change:(old:typeof before)=>typeof before)=>{state=change(state);}});
    assert.equal(state.gameweekScoreStatus,disposed?"PROVISIONAL":"UNAVAILABLE");
    assert.equal(state.gameweekScore,41.19);
    assert.equal(state.seasonScore,82.5);
    if (disposed) assert.strictEqual(state,before);
    else assert.equal(state.qaClubMarketOpen,false);
  }
});
