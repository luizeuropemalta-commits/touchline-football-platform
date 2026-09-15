import { createHash } from "node:crypto";
import { readFile, stat } from "node:fs/promises";
import { basename, dirname, join } from "node:path";

import { createStudioReviewStorageCore } from "../../lib/touchlineArena/social-studio-storage-core.ts";
import type { StudioMedia } from "../../lib/touchlineArena/social-studio-contract.ts";

type Evidence = {
  artId: string; version: string; placement: "FEED" | "STORY";
  filePath: string; sha256: string; width: number; height: number; durationSeconds: number;
  caption: string; captions?: { instagram?: string; facebook?: string };
  provenance: Omit<StudioMedia["provenance"], "snapshotPath" | "snapshotSha256">;
};

const input = process.argv.slice(2);
if (!input.length) throw new Error("Provide one or more render-evidence.json paths.");
const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
if (!url || !serviceRoleKey) throw new Error("QA Supabase credentials are required through the environment.");

const checksum = (bytes: Uint8Array) => `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
const storage = createStudioReviewStorageCore({
  supabaseUrl: url,
  serviceRoleKey,
  getBucket: async () => {
    const response = await fetch(`${url}/storage/v1/bucket/touchline-social-studio-review`, {
      headers: { apikey: serviceRoleKey, authorization: `Bearer ${serviceRoleKey}` },
    });
    if (!response.ok) throw new Error(`STUDIO_BUCKET_READ_FAILED:${response.status}`);
    return await response.json();
  },
  createSignedUrl: async () => { throw new Error("Not used by the importer."); },
});

const imported: StudioMedia[] = [];
for (const evidencePath of input) {
  const evidence = JSON.parse(await readFile(evidencePath, "utf8")) as Evidence;
  const folder = dirname(evidencePath);
  const videoPath = join(folder, basename(evidence.filePath));
  const snapshotPath = join(folder, "factual-snapshot.json");
  const reportPath = join(folder, "decode-two-loops", "probe.json");
  const [video, snapshot, report, information] = await Promise.all([
    readFile(videoPath), readFile(snapshotPath), readFile(reportPath), stat(videoPath),
  ]);
  const hash = evidence.sha256;
  if (checksum(video) !== hash) throw new Error(`Checksum mismatch for ${videoPath}`);
  const objectKey = `v1/${evidence.artId}/${evidence.placement}/${hash.slice("sha256:".length)}.mp4`;
  const media = await storage.uploadCreateOnly({
    artId: evidence.artId,
    version: evidence.version,
    placement: evidence.placement,
    filePath: evidence.filePath,
    sha256: hash,
    width: evidence.width,
    height: evidence.height,
    durationSeconds: evidence.durationSeconds,
    caption: evidence.caption,
    captions: evidence.captions ? { INSTAGRAM: evidence.captions.instagram ?? evidence.caption, FACEBOOK: evidence.captions.facebook ?? evidence.caption } : undefined,
    objectKey,
    byteSize: information.size,
    verification: { reportPath: `${folder}/decode-two-loops/probe.json`, reportSha256: checksum(report) },
    provenance: { ...evidence.provenance, snapshotPath, snapshotSha256: checksum(snapshot) },
  }, video);
  imported.push(media);
}

process.stdout.write(`${JSON.stringify(imported, null, 2)}\n`);
