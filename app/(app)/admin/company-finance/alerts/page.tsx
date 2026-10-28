import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import CompanyAlertsPanel from "@/components/touchline/admin/CompanyAlertsPanel";
export const dynamic="force-dynamic";
export default async function CompanyFinanceAlertsPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const client=await createClient();if(!client)notFound();const {data:{user},error}=await client.auth.getUser();
 if(error||!hasTouchLineArenaAccess(user)||!isOwnerEmail(user?.email))notFound();
 return <CompanyAlertsPanel portuguese={(await searchParams)?.lang==="pt-BR"}/>;
}
