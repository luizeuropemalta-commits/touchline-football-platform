import { notFound } from "next/navigation";
import { hasTouchlineAuditToken, isTouchlineAuditExpired, isTouchlineAuditMode } from "@/lib/touchlineAudit/access";
import { TouchlineAuditStudio } from "@/components/touchline/audit/TouchlineAuditStudio";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "TouchLine Audit Mode" };

export default async function TouchlineAuditRoute({
  params,
  searchParams,
}: {
  params: Promise<{ route: string[] }>;
  searchParams: Promise<{ auditToken?: string | string[]; persona?: string; matchState?: string; lang?: string }>;
}) {
  const query = await searchParams;
  const auditToken = typeof query.auditToken === "string" ? query.auditToken : null;
  // Catch-all suffixes can be excluded by the proxy's static-asset matcher.
  if (!auditToken || !isTouchlineAuditMode() || isTouchlineAuditExpired() || !hasTouchlineAuditToken(auditToken)) notFound();
  const { route } = await params;
  return <TouchlineAuditStudio auditToken={auditToken} routeId={route.join("/")} initialPersona={query.persona} initialMatchState={query.matchState} initialLanguage={query.lang} />;
}
