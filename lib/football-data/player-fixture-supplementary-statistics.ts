import { touchLineCanonicalPlayerPositionGroup, touchLineDefensiveActionScore } from "./player-fixture-scoring.ts";

/** Descriptive card facts only. Never contributes to rating or ranking points. */
export function touchLinePlayerFixtureSupplementaryStatistics(input: {
 position: string | null | undefined; appearanceStatus: string; minutesPlayed: number | null;
 teamGoalsConceded: number | null; statistics: Readonly<Record<string, number>>;
}): Record<string, number> {
 const result: Record<string, number> = {};
 if (!['started','substitute'].includes(input.appearanceStatus)
   || input.minutesPlayed === null || !Number.isFinite(input.minutesPlayed) || input.minutesPlayed <= 0) return result;
 const conceded=input.teamGoalsConceded;
 if (conceded !== null && Number.isInteger(conceded) && conceded >= 0) result['clean-sheets']=conceded===0 ? 1 : 0;
 const group=touchLineCanonicalPlayerPositionGroup(input.position);
 if (!group || group==='Goalkeeper') return result;
 const read=(...keys:string[]) => {
  for(const key of keys) {
   const value=input.statistics[key];
   if(typeof value==='number' && Number.isFinite(value) && value>=0) return value;
  }
  return null;
 };
 const values=[read('tackles-won'),read('interceptions'),read('clearances'),read('blocked-shots','shots-blocked'),read('aerials-won','aeriels-won')];
 // An omitted provider fact is not proof of zero. Require all five components.
 if(values.every((value):value is number=>value!==null)) {
  const total=values.reduce((sum,value)=>sum+value,0);
  result['defensive-actions-total']=total;
  result['def-score']=touchLineDefensiveActionScore(group,total)!;
 }
 return result;
}
