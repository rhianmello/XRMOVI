// Mercado Pago preapproval request builder. Contains no credentials.
// The provider documentation uses "canceled"; some instances reject that
// status on PUT. The alternate spelling is a strictly gated contingency.
export const CANCELED_STATUS = "canceled";
export const ALTERNATE_CANCELED_STATUS = "cancelled";
export const isCancelled = status => status === CANCELED_STATUS || status === ALTERNATE_CANCELED_STATUS;

export function preapprovalPath(id) {
  if (typeof id !== "string" || !/^[a-z0-9]{20,72}$/i.test(id)) {
    throw new TypeError("Identificador de assinatura inválido.");
  }
  return "/preapproval/" + encodeURIComponent(id);
}

export function preapprovalSearchPath(options = {}) {
  const {payerEmail, limit = 50, offset = 0, ...unsupported} = options;
  if (Object.keys(unsupported).length) {
    throw new TypeError("Filtro não suportado na busca: " + Object.keys(unsupported).join(", "));
  }
  if (typeof payerEmail !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payerEmail)) {
    throw new TypeError("E-mail de busca inválido.");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > 50 ||
      !Number.isInteger(offset) || offset < 0) {
    throw new TypeError("Paginação de busca inválida.");
  }
  const qs = new URLSearchParams({
    payer_email: payerEmail, limit: String(limit), offset: String(offset)
  });
  return "/preapproval/search?" + qs.toString();
}

export function isSpecificCanceled400(error) {
  if (error?.httpStatus !== 400) return false;
  const message = String(error?.providerMessage || error?.message || "").trim();
  return /(?:^|[.\s])Invalid preapproval status param:\s*canceled\.?\s*$/i.test(message);
}

// request(path, method='GET', body?) is the existing server-side MP transport.
// verifyResource(resource) must bind the ID, external_reference and collector_id.
export async function cancelPreapproval(request, id, {initial = null, verifyResource = null, onRejected = null} = {}) {
  const path = preapprovalPath(id);
  const read = async () => {
    const value = await request(path, "GET");
    if (String(value?.id) !== id || (verifyResource && !verifyResource(value))) {
      throw new Error("Identidade da assinatura divergente; cancelamento bloqueado.");
    }
    return value;
  };
  // A real GET must precede every mutation. 'initial' is only an optimization
  // for callers that already performed and checked that GET.
  let current = initial ?? await read();
  if (String(current?.id) !== id || (verifyResource && !verifyResource(current))) {
    throw new Error("Identidade da assinatura divergente; cancelamento bloqueado.");
  }
  if (isCancelled(String(current.status || ""))) return await read();
  if (!["pending", "paused"].includes(String(current.status || ""))) {
    throw new Error("A assinatura não está em um estado permitido para essa troca.");
  }

  const attempt = async status => {
    let failure = null;
    try {
      await request(path, "PUT", {status});
    } catch (err) {
      failure = err;
      if (typeof onRejected === "function") onRejected(status, err);
    }
    // Regardless of PUT result, never infer success without a fresh GET.
    const verified = await read();
    return {verified, failure};
  };

  const first = await attempt(CANCELED_STATUS);
  if (isCancelled(String(first.verified.status || ""))) return first.verified;
  // Only a provider HTTP 400 specifically rejecting 'canceled' permits the
  // second write, and only while the SAME resource remains pending/paused.
  if (!first.failure || !isSpecificCanceled400(first.failure) ||
      !["pending", "paused"].includes(String(first.verified.status || ""))) {
    return first.verified;
  }
  const second = await attempt(ALTERNATE_CANCELED_STATUS);
  return second.verified;
}

export async function searchPreapprovals(request, options) {
  return request(preapprovalSearchPath(options), "GET");
}
