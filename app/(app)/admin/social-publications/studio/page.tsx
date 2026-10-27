/* Private PNGs bypass the public image optimizer and are authenticated on each request. */
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { notFound } from "next/navigation";
import { GamePanel } from "@/components/arena-admin-ui";
import { createAdminClient } from "@/lib/supabase/admin";
import { authorizeStudio } from "@/lib/touchlineArena/social-studio-server";
import { assertTouchlineSocialQaRuntime } from "@/lib/touchlineArena/social-artifact-storage-server";
import { STUDIO_PNG_COLUMNS, studioPngLocator, studioPngCopy, type StudioPngDraft } from "@/lib/touchlineArena/social-studio-png";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
const linkStyle = "inline-flex text-sm font-bold text-[#b7ff45] underline underline-offset-4";
export default async function SocialStudioPage({ searchParams }: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  if (!await authorizeStudio()) notFound();
  const query = await searchParams ?? {}, copy = studioPngCopy(query.lang);
  const parsed = Number(query.page ?? 0), page = Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= 10000 ? parsed : 0;
  const pageSize = 12;
  let drafts: StudioPngDraft[] = [], failed = false, hasNext = false;
  try {
    assertTouchlineSocialQaRuntime();
    const admin = createAdminClient();
    if (!admin) throw new Error("UNAVAILABLE");
    const { data, error } = await admin.from("touchline_social_publication_drafts").select(STUDIO_PNG_COLUMNS)
      .eq("artifact_content_type", "image/png").neq("approval_state", "CANCELLED")
      .order("created_at", { ascending: false }).order("id", { ascending: false }).range(page * pageSize, page * pageSize + pageSize).returns<StudioPngDraft[]>();
    if (error) throw new Error("UNAVAILABLE");
    hasNext = (data?.length ?? 0) > pageSize;
    drafts = (data ?? []).slice(0, pageSize).filter(draft => studioPngLocator(draft) !== null);
  } catch { failed = true; }
  return <div className="mx-auto max-w-[1440px] space-y-6" lang={copy.lang}>
    <GamePanel className="p-6 sm:p-8">
      <h1 className="text-4xl font-black italic text-white sm:text-5xl">{copy.title}</h1>
      <p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">{copy.subtitle}</p>
      <p className="mt-3 text-sm text-slate-400">{copy.paused}</p>
      <Link className={`${linkStyle} mt-5`} href={`/admin/social-publications?lang=${copy.lang}`}>{copy.back}</Link>
    </GamePanel>
    {failed ? <GamePanel className="p-6"><p role="alert">{copy.unavailable}</p></GamePanel> : drafts.length === 0 ? <p role="status">{copy.empty}</p> : null}
    <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{drafts.map(draft => {
      const href = `/api/admin/social-publications/studio/png?id=${encodeURIComponent(draft.id)}`;
      return <GamePanel key={draft.id} className="min-w-0 space-y-4 p-5">
        <h2 className="text-lg font-bold text-white">{draft.content_type} · {draft.placement}</h2>
        <p className="text-sm text-slate-400">{copy.revision} {draft.revision} · {draft.locale} · {draft.width} × {draft.height}</p>
        <a href={href} target="_blank" rel="noopener noreferrer" aria-label={copy.preview}>
          <img src={href} width={draft.width} height={draft.height} alt={`${copy.image} · ${draft.content_type} · ${draft.fixture_provider_id}`} loading="lazy" className="max-h-[480px] w-full object-contain" />
        </a>
        <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-300">{draft.caption}</p>
        <a className={linkStyle} href={`${href}&download=1`}>{copy.download}</a>
      </GamePanel>;
    })}</div>
    {!failed ? <nav className="flex flex-wrap gap-6" aria-label={copy.title}>
      {page > 0 ? <Link className={linkStyle} href={`?lang=${copy.lang}&page=${page - 1}`}>{copy.previous}</Link> : null}
      {hasNext ? <Link className={linkStyle} href={`?lang=${copy.lang}&page=${page + 1}`}>{copy.next}</Link> : null}
    </nav> : null}
  </div>;
}
