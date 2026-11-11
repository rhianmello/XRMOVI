// Payload for POST /v1/payments, Pix (Mercado Pago Checkout API).
// The POST endpoint infers currency for the Brazilian Pix method.
// Do NOT send 'currency_id' in this creation request; the provider rejects it.
// Currency must still be verified in the payment RESPONSE and webhooks.
export function buildPixPaymentPayload({
  amount, plan, id, url, expiration, email, first, last, cpf
}) {
  const value=Number(amount);
  if (!Number.isFinite(value) || value<=0) throw new TypeError("Valor do Pix inválido.");
  if (typeof id!=="string" || !/^[a-f0-9-]{36}$/i.test(id)) {
    throw new TypeError("Referência do Pix inválida.");
  }
  if (typeof url!=="string" || !/^https:\/\/[^/]+$/.test(url)) {
    throw new TypeError("Endereço do webhook inválido.");
  }
  if (!Number.isFinite(Date.parse(String(expiration)))) {
    throw new TypeError("Validade do Pix inválida.");
  }
  return {
    transaction_amount:value,
    description:"XRMOVI Plano "+String(plan)+" - 1 mes",
    payment_method_id:"pix",
    external_reference:id,
    notification_url:url+"/functions/v1/xrmovi-pix-webhook",
    date_of_expiration:String(expiration),
    payer:{
      email:String(email),
      first_name:String(first),
      last_name:String(last),
      identification:{type:"CPF",number:String(cpf)}
    }
  };
}
