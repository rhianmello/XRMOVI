import test from "node:test";
import assert from "node:assert/strict";
import {
  CANCELED_STATUS, ALTERNATE_CANCELED_STATUS, isCancelled,
  isSpecificCanceled400, preapprovalPath, preapprovalSearchPath,
  cancelPreapproval, searchPreapprovals
} from "../supabase/functions/xrmovi-pix/preapproval-transport.js";

const id="0123456789abcdef0123456789abcdef";
const resource=(status="pending")=>({
  id,status,external_reference:"safe-test-intent",collector_id:10284642
});
const valid=r=>r?.id===id&&r.external_reference==="safe-test-intent"&&r.collector_id===10284642;
const rejected=(message="Invalid preapproval status param: canceled",status=400)=>{
  const err=new Error(message);
  err.httpStatus=status;err.providerMessage=message;
  err.providerError="bad_request";err.causes=[{code:"invalid_status",description:message}];
  return err;
};

test("GET before PUT: primary canceled in JSON, GET confirmation, no query",async()=>{
  let state="pending";const calls=[];
  const mp=async(path,method,body)=>{
    calls.push({path,method,body});
    assert.equal(path,"/preapproval/"+id);
    if(method==="PUT"){state=body.status;return resource(state);}
    return resource(state);
  };
  const result=await cancelPreapproval(mp,id,{verifyResource:valid});
  assert.equal(result.status,"canceled");
  assert.deepEqual(calls.map(x=>x.method),["GET","PUT","GET"]);
  assert.deepEqual(calls[1].body,{status:"canceled"});
  assert.equal(JSON.stringify(calls).includes("Timestamp"),false);
  assert.equal(JSON.stringify(calls).includes("status="),false);
});

test("HTTP 400 with exact canceled error -> one controlled cancelled PUT -> final GET",async()=>{
  let state="pending";const calls=[];const logs=[];
  const mp=async(path,method,body)=>{
    calls.push({path,method,body});
    if(method==="PUT"&&body.status==="canceled")throw rejected();
    if(method==="PUT"&&body.status==="cancelled")state="cancelled";
    return resource(state);
  };
  const result=await cancelPreapproval(mp,id,{initial:resource(),verifyResource:valid,onRejected:(status,e)=>logs.push({status,error:e})});
  assert.equal(result.status,"cancelled");
  assert.equal(isCancelled(result.status),true);
  assert.deepEqual(calls.map(x=>x.method),["PUT","GET","PUT","GET"]);
  assert.deepEqual(calls.filter(x=>x.method==="PUT").map(x=>x.body),
   [{status:"canceled"},{status:"cancelled"}]);
  assert.equal(logs.length,1);
  assert.equal(logs[0].error.httpStatus,400);
});

test("400 unrelated error never triggers alternate PUT",async()=>{
  const calls=[];const mp=async(path,method,body)=>{
    calls.push({method,body});
    if(method==="PUT")throw rejected("Other provider error",400);
    return resource();
  };
  const result=await cancelPreapproval(mp,id,{initial:resource(),verifyResource:valid});
  assert.equal(result.status,"pending");
  assert.deepEqual(calls.map(x=>x.method),["PUT","GET"]);
});

test("403/500 and network errors never trigger fallback",async()=>{
  for(const status of [403,500]){
   const calls=[];const mp=async(path,method,body)=>{
    calls.push(method);
    if(method==="PUT")throw rejected("Invalid preapproval status param: canceled",status);
    return resource();
   };
   const r=await cancelPreapproval(mp,id,{initial:resource(),verifyResource:valid});
   assert.equal(r.status,"pending");
   assert.deepEqual(calls,["PUT","GET"]);
  }
});

test("initial authorized subscription is never canceled",async()=>{
  const calls=[];const mp=async(path,method)=>{calls.push(method);return resource("authorized");};
  await assert.rejects(cancelPreapproval(mp,id,{verifyResource:valid}),/estado permitido/);
  assert.deepEqual(calls,["GET"]);
});

test("already cancelled subscription does not receive a PUT",async()=>{
  const calls=[];const mp=async(path,method)=>{calls.push(method);return resource("cancelled");};
  const r=await cancelPreapproval(mp,id,{verifyResource:valid});
  assert.equal(r.status,"cancelled");
  assert.equal(calls.includes("PUT"),false);
});

test("GET reports cancellation despite PUT 400: no duplicate second PUT",async()=>{
  let state="pending";const calls=[];
  const mp=async(path,method,body)=>{
    calls.push({method,body});
    if(method==="PUT"){state="canceled";throw rejected();}
    return resource(state);
  };
  const r=await cancelPreapproval(mp,id,{verifyResource:valid});
  assert.equal(r.status,"canceled");
  assert.deepEqual(calls.map(c=>c.method),["GET","PUT","GET"]);
});

test("mismatched external_reference after HTTP 400 blocks fallback",async()=>{
  let reads=0;const calls=[];
  const mp=async(path,method,body)=>{
    calls.push({method,body});
    if(method==="PUT")throw rejected();
    reads++;
    if(reads===1)return resource();
    return {...resource(),external_reference:"other-account"};
  };
  await assert.rejects(cancelPreapproval(mp,id,{verifyResource:valid}),/divergente/);
  assert.equal(calls.filter(x=>x.method==="PUT").length,1);
});

test("both PUT 400 return pending; never infer cancellation",async()=>{
  const calls=[];
  const mp=async(path,method,body)=>{
   calls.push({method,body});
   if(method==="PUT")throw rejected("Invalid preapproval status param: "+body.status);
   return resource("pending");
  };
  const r=await cancelPreapproval(mp,id,{initial:resource(),verifyResource:valid});
  assert.equal(r.status,"pending");
  assert.deepEqual(calls.filter(c=>c.method==="PUT").map(c=>c.body.status),["canceled","cancelled"]);
  assert.equal(calls.at(-1).method,"GET");
});

test("status is constant; timestamp/log suffix does not qualify for fallback",()=>{
  assert.equal(CANCELED_STATUS,"canceled");
  assert.equal(ALTERNATE_CANCELED_STATUS,"cancelled");
  assert.equal(isSpecificCanceled400(rejected()),true);
  assert.equal(isSpecificCanceled400(rejected("Invalid preapproval status param: canceled[Timestamp: 2026-11-04]")),false);
});

test("search stays GET without status and rejects extra filters and timestamp",async()=>{
  const calls=[];const request=async(path,method,body)=>{
   calls.push({path,method,body});return {results:[],paging:{total:0}};
  };
  await searchPreapprovals(request,{payerEmail:"tester@example.invalid",limit:50,offset:0});
  assert.equal(calls.length,1);assert.equal(calls[0].method,"GET");
  assert.equal(calls[0].body,undefined);
  assert.equal(calls[0].path,"/preapproval/search?payer_email=tester%40example.invalid&limit=50&offset=0");
  assert.equal(calls[0].path.includes("status="),false);
  assert.throws(()=>preapprovalSearchPath({payerEmail:"tester@example.invalid",status:"canceled"}),/não suportado/);
  assert.throws(()=>preapprovalSearchPath({payerEmail:"tester@example.invalid",status:"canceled[Timestamp: 2026-11-04]"}),/não suportado/);
  assert.throws(()=>preapprovalPath(id+"[Timestamp: 2026-11-04]"),/inválido/);
});

import {buildPixPaymentPayload} from "../supabase/functions/xrmovi-pix/pix-payment-payload.js";

test("Pix POST request has no currency_id, preserves stable idempotency reference",()=>{
  const payload=buildPixPaymentPayload({
    amount:"19.90",plan:"start",id:"11111111-1111-4111-8111-111111111111",
    url:"https://example.supabase.co",
    expiration:"2026-11-05T18:00:00Z",
    email:"payer@example.invalid",first:"Test",last:"User",cpf:"00000000000"
  });
  assert.equal(payload.payment_method_id,"pix");
  assert.equal(payload.transaction_amount,19.9);
  assert.equal(payload.external_reference,"11111111-1111-4111-8111-111111111111");
  assert.equal(payload.payer.identification.type,"CPF");
  assert.equal(Object.hasOwn(payload,"currency_id"),false);
  assert.equal(JSON.stringify(payload).includes("currency_id"),false);
  assert.equal(payload.notification_url,"https://example.supabase.co/functions/v1/xrmovi-pix-webhook");
});

test("Pix POST rejects invalid amount/reference and doesn't mutate input",()=>{
  const fields={
    amount:"19.90",plan:"start",id:"11111111-1111-4111-8111-111111111111",
    url:"https://example.supabase.co",expiration:"2026-11-05T18:00:00Z",
    email:"payer@example.invalid",first:"Test",last:"User",cpf:"00000000000"
  };
  const clone={...fields};
  assert.throws(()=>buildPixPaymentPayload({...fields,amount:0}),/Valor/);
  assert.throws(()=>buildPixPaymentPayload({...fields,id:"bad[Timestamp: 2026]"}),/Referência/);
  assert.throws(()=>buildPixPaymentPayload({...fields,url:"http://example.supabase.co"}),/webhook/);
  buildPixPaymentPayload(fields);
  assert.deepEqual(fields,clone);
});
