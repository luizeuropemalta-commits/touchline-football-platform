import { TouchlineAuditStudio } from "@/components/touchline/audit/TouchlineAuditStudio";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, title: "TouchLine Audit Mode" };

export default async function TouchlineAuditIndex({ searchParams }: { searchParams: Promise<{ auditToken?: string }> }) {
  const { auditToken = "" } = await searchParams;
  return <TouchlineAuditStudio auditToken={auditToken} />;
}
