import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import CompanyFinancePanel from "@/components/touchline/admin/CompanyFinancePanel";
import { normalizeTouchLineAuthLocale } from "@/lib/touchlineArena/auth-i18n";
export const dynamic="force-dynamic";
export default async function CompanyFinancePage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const session=await createClient();if(!session)notFound();
 const {data:{user},error}=await session.auth.getUser();
 if(error||!hasTouchLineArenaAccess(user)||!isOwnerEmail(user?.email))notFound();
 const params=await searchParams;
 const locale=normalizeTouchLineAuthLocale(typeof params?.lang==="string"?params.lang:null);
 return <CompanyFinancePanel portuguese={locale==="pt-BR"} />;
}
