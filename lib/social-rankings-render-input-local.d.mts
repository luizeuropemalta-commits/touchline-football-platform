import type { RankingsLiveRenderInput } from "./social-rankings-live-server";

export function rankingsInputSelection(runId: unknown, inputSha256: unknown): { runId: string; inputSha256: string } | null;
export function validateRankingsLocalInput(value: unknown): RankingsLiveRenderInput;
export function readRankingsLocalInput(root: string, runId: unknown, inputSha256: unknown): Promise<{
  input: RankingsLiveRenderInput;
  runId: string;
  inputSha256: string;
}>;
