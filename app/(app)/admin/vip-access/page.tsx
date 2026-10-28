import { notFound } from "next/navigation";
import AdminVipAccess from "@/components/admin-vip-access";
import { GamePanel, LivePill } from "@/components/arena-admin-ui";
import { isOwnerEmail } from "@/lib/admin/owner";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function AdminVipAccessPage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = (await searchParams) ?? {};
  const locale = normalizeTouchLineAuthLocale(typeof params.lang === "string" ? params.lang : null);
  const pt = locale === "pt-BR";
  const supabase = await createClient();
  const viewer = supabase ? await supabase.auth.getUser().catch(() => null) : null;
  if (!viewer || viewer.error || !viewer.data.user || !hasTouchLineArenaAccess(viewer.data.user) || !isOwnerEmail(viewer.data.user.email)) notFound();
  if (!createAdminClient()) return <GamePanel className="p-8"><h1 className="text-2xl text-white">{pt ? "Acesso VIP" : "VIP access"}</h1><p className="mt-3 text-sm text-slate-300">{pt ? "A configuração protegida está indisponível. Nenhuma concessão pode ser enviada." : "Protected configuration is unavailable. No grant can be submitted."}</p></GamePanel>;
  return <GamePanel className="mx-auto max-w-4xl p-6 sm:p-8">
    <LivePill>{pt ? "Somente proprietário" : "Owner only"}</LivePill>
    <h1 className="mb-4 mt-5 text-3xl font-bold text-white">{pt ? "Convidados" : "Guest access"}</h1>
    <p className="mb-6 max-w-2xl text-sm leading-6 text-slate-300">{pt ? "Escolha Standard, Master ou VIP para uma conta cadastrada e com e-mail confirmado. A concessão gratuita mantém as regras e o orçamento normais do plano; só aparece concluída após confirmação do servidor." : "Choose Standard, Master or VIP for an existing account with a verified email. Complimentary access keeps the plan's normal rules and budget; completion requires server confirmation."}</p>
    <AdminVipAccess locale={locale} />
  </GamePanel>;
}
