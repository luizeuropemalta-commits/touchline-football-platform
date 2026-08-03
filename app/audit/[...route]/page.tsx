import { TouchlineAuditStudio } from "@/components/touchline/audit/TouchlineAuditStudio";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "TouchLine Audit Mode" };

export default async function TouchlineAuditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ route: string[] }>;
  searchParams: Promise<{ auditToken?: string; persona?: string; matchState?: string; lang?: string }>;
}) {
  const [{ route }, query] = await Promise.all([params, searchParams]);
  return <TouchlineAuditStudio auditToken={query.auditToken ?? ""} routeId={route.join("/")} initialPersona={query.persona} initialMatchState={query.matchState} initialLanguage={query.lang} />;
}
