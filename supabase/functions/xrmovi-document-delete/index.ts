import {createClient} from "npm:@supabase/supabase-js@2.58.0";

// Deleting private documents is a two-phase server operation:
// 1) authenticated, owner/manager-only prepare; 2) Storage API removal;
// 3) service-only metadata removal + immutable audit record.
const allowedOrigins=new Set(["https://frota.nospassa.com.br","https://www.frota.nospassa.com.br"]);
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;
function output(body:unknown,status:number,origin:string){
 const headers:Record<string,string>={
  "content-type":"application/json; charset=utf-8",
  "cache-control":"no-store",
  "vary":"Origin",
  "access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info"
 };
 if(allowedOrigins.has(origin))headers["access-control-allow-origin"]=origin;
 return new Response(JSON.stringify(body),{status,headers});
}
Deno.serve(async request=>{
 const origin=request.headers.get("origin")||"";
 if(origin&&!allowedOrigins.has(origin))return output({error:"Origem não permitida."},403,origin);
 if(request.method==="OPTIONS")return new Response(null,{status:204,headers:{
  "access-control-allow-origin":allowedOrigins.has(origin)?origin:"https://frota.nospassa.com.br",
  "access-control-allow-methods":"POST, OPTIONS",
  "access-control-allow-headers":"authorization, apikey, content-type, x-client-info",
  "vary":"Origin"
 }});
 if(request.method!=="POST")return output({error:"Método não permitido."},405,origin);
 const bearer=request.headers.get("authorization")||"";
 if(!bearer.startsWith("Bearer "))return output({error:"Entre na conta novamente."},401,origin);
 const url=Deno.env.get("SUPABASE_URL")||"";
 const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
 const serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
 if(!url||!anon||!serviceKey)return output({error:"Serviço indisponível."},503,origin);
 try{
  const payload=await request.json();
  const cid=String(payload?.company_id||"");
  const attachmentId=String(payload?.attachment_id||"");
  const source=String(payload?.source||"");
  if(!uuid.test(cid)||!uuid.test(attachmentId)||!["record","legacy"].includes(source)){
   return output({error:"Identificação do documento inválida."},400,origin);
  }
  const authClient=createClient(url,anon,{global:{headers:{Authorization:bearer}},auth:{persistSession:false}});
  const {data:identity,error:authError}=await authClient.auth.getUser(bearer.slice(7));
  if(authError||!identity.user)return output({error:"Sessão inválida."},401,origin);
  const {data:prepared,error:prepareError}=await authClient.rpc("xrmovi_document_delete_prepare",{
   cid,p_source:source,p_attachment_id:attachmentId
  });
  if(prepareError||!prepared?.path){
   return output({error:"Você não tem permissão para excluir este documento ou ele não foi encontrado."},403,origin);
  }
  const bucket=String(prepared.bucket||"");
  const path=String(prepared.path||"");
  if(prepared.attachment_id!==attachmentId||prepared.source!==source
    ||!["xrmovi-record-attachments","xrmovi-vehicle-docs"].includes(bucket)
    ||path.length>600||!path||path.startsWith("/")||path.includes("..")){
   return output({error:"Referência de documento inválida."},400,origin);
  }
  const service=createClient(url,serviceKey,{auth:{persistSession:false}});
  const {error:removeError}=await service.storage.from(bucket).remove([path]);
  if(removeError){
   console.error("XRMOVI document Storage deletion failed",{source,code:String(removeError.name||"storage").slice(0,50)});
   return output({error:"Não foi possível excluir o arquivo do armazenamento. Nada foi removido do cadastro."},502,origin);
  }
  const {data:completed,error:finishError}=await service.rpc("xrmovi_document_delete_commit",{
   cid,p_source:source,p_attachment_id:attachmentId,p_path:path,p_actor:identity.user.id
  });
  if(finishError||completed!==true){
   console.error("XRMOVI document audit commit failed",{source,code:String(finishError?.code||"audit").slice(0,40)});
   return output({error:"O arquivo foi excluído, mas o registro de auditoria não foi concluído. Procure o suporte."},502,origin);
  }
  return output({deleted:true},200,origin);
 }catch(error){
  console.error("XRMOVI document deletion interrupted",{type:error instanceof Error?error.name:"unknown"});
  return output({error:"Não foi possível concluir a exclusão."},500,origin);
 }
});
