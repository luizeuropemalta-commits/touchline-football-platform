import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { resolveClubSeasonTestConfiguration } from '@/lib/stripe/club-season-test-catalogue';
import { verifyClubSeasonTestWebhook, readClubSeasonTestWebhookSubject } from '@/lib/stripe/club-season-provider.server';
import { mapClubSeasonStoredOrder } from '@/lib/stripe/club-season-order-store.server';
import { readSeasonWebhookBody, processClubSeasonWebhook } from '@/lib/stripe/club-season-webhook-service';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const headers={'Cache-Control':'private, no-store'};
export async function POST(request:Request) {
 if(!resolveClubSeasonTestConfiguration().ok) return NextResponse.json({error:'SEASON_CHECKOUT_UNAVAILABLE'},{status:503,headers});
 let event;
 try {event=await verifyClubSeasonTestWebhook(await readSeasonWebhookBody(request),request.headers.get('stripe-signature')??'');}
 catch {return NextResponse.json({error:'INVALID_WEBHOOK'},{status:400,headers});}
 try {
  const admin=createAdminClient();if(!admin) throw new Error('STORAGE_UNAVAILABLE');
  const subject=await readClubSeasonTestWebhookSubject(event);
  const rpc=async(name:string,args:Record<string,unknown>)=>{
    const {data,error}=await admin.rpc(name,args);if(error) throw new Error('STORAGE_UNAVAILABLE');return data;
  };
  const result=await processClubSeasonWebhook(event.id,subject,{
   async read(orderId) {
    const {data,error}=await admin.from('touchline_club_season_test_orders').select('*').eq('id',orderId).maybeSingle();
    if(error) throw new Error('STORAGE_UNAVAILABLE');if(!data) return null;
    const order=mapClubSeasonStoredOrder(data);return {...order,sessionId:order.sessionId??''};
   },
   fulfill:(id,eventId,evidence)=>rpc('touchline_club_fulfill_season_test_order',{p_order_id:id,p_event_id:eventId,p_evidence:evidence}),
   review:(id,eventId,type,session)=>rpc('touchline_club_review_season_test_order',{p_order_id:id,p_event_id:eventId,p_event_type:type,p_session_id:session}),
   expire:(id,eventId,session)=>rpc('touchline_club_expire_season_test_order',{p_order_id:id,p_event_id:eventId,p_session_id:session}),
  });
  return NextResponse.json(result,{headers});
 } catch {return NextResponse.json({error:'SEASON_WEBHOOK_RETRY_REQUIRED'},{status:503,headers});}
}
