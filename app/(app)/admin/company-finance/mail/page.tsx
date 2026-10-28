import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isOwnerEmail } from "@/lib/admin/owner";
import { hasTouchLineArenaAccess } from "@/lib/touchlineArena/auth-access";
import CompanyMailPanel from "@/components/touchline/admin/CompanyMailPanel";
export const dynamic="force-dynamic";
export default async function CompanyMailPage({searchParams}:{searchParams?:Promise<Record<string,string|string[]|undefined>>}){
 const session=await createClient();if(!session)notFound();
 const {data:{user},error}=await session.auth.getUser();
 if(error||!hasTouchLineArenaAccess(user)||!isOwnerEmail(user?.email))notFound();
 return <CompanyMailPanel portuguese={(await searchParams)?.lang==="pt-BR"}/>;
}
