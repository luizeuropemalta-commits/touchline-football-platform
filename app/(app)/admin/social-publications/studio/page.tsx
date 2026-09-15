import Link from "next/link";
import { notFound } from "next/navigation";

import { GamePanel, LivePill } from "@/components/arena-admin-ui";
import TouchlineSocialStudio from "@/components/touchline/admin/TouchlineSocialStudio";
import { authorizeStudio, readStudioSnapshot } from "@/lib/touchlineArena/social-studio-server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SocialStudioPage() {
  if (!await authorizeStudio()) notFound();
  const snapshot = await readStudioSnapshot();
  return <div className="mx-auto max-w-[1440px] space-y-6">
    <GamePanel className="p-6 sm:p-8"><LivePill>Artes vivas · aprovação no Admin</LivePill><h1 className="mt-5 text-4xl font-black italic text-white sm:text-5xl">Studio de publicações</h1><p className="mt-4 max-w-4xl text-sm leading-6 text-slate-300">Confira cada vídeo e legenda por versão, escolha Feed e Stories em cada rede e reserve dia, hora e fuso das artes sem evento. Aprovar um modelo não autoriza publicação. Eventos aguardam confirmação oficial; todos os envios continuam pausados até a integração ser validada.</p><Link className="mt-5 inline-flex text-sm font-bold text-[#b7ff45] underline underline-offset-4" href="/admin/social-publications">Voltar às publicações sociais</Link></GamePanel>
    <TouchlineSocialStudio snapshot={snapshot} />
  </div>;
}
