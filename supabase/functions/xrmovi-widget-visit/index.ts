// XRMOVI Monitor: contador de visitantes consentidos, sem dados pessoais.
import { createClient } from "npm:@supabase/supabase-js@2.58.0";
const ORIGIN = "https://frota.nospassa.com.br";
const headers = {
  "Access-Control-Allow-Origin": ORIGIN,
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type",
  "Cache-Control": "no-store",
  "Vary": "Origin"
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const respond = (status:number) => new Response(null,{status,headers});
Deno.serve(async(req:Request)=>{
  if(req.headers.get("origin")!==ORIGIN)return respond(403);
  if(req.method==="OPTIONS")return respond(204);
  if(req.method!=="POST")return respond(405);
  if(!(req.headers.get("content-type")||"").includes("application/json"))return respond(415);
  if(Number(req.headers.get("content-length")||0)>256)return respond(413);
  try {
    const raw=await req.text();
    if(raw.length>256)return respond(413);
    const input=JSON.parse(raw);
    if(typeof input?.visitor_id!=="string"||!uuid.test(input.visitor_id))return respond(400);
    const url=Deno.env.get("SUPABASE_URL");
    const secret=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if(!url||!secret)return respond(503);
    const client=createClient(url,secret,{auth:{persistSession:false,autoRefreshToken:false}});
    const {error}=await client.rpc("xrmovi_widget_record_visit",{p_visitor:input.visitor_id});
    if(error){console.error("Visit ping failed",error.code||"unknown");return respond(503);}
    return respond(204);
  }catch{return respond(400);}
});