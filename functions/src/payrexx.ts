import * as crypto from 'crypto'

export interface PayrexxGateway {
  id: number
  link: string
}

// Signature PayRexx : HMAC-SHA256(query string des params) → base64 → url-encode
// Ref : https://developer.payrexx.com/docs/sign-request
function buildSignature(params: URLSearchParams, apiSecret: string): string {
  const hmac = crypto.createHmac('sha256', apiSecret)
  hmac.update(params.toString())
  return encodeURIComponent(hmac.digest('base64'))
}

export async function createPayrexxGateway(opts: {
  instance: string
  apiSecret: string
  amountCHF: number
  purpose: string
  referenceId: string
  returnUrl: string
}): Promise<PayrexxGateway> {
  const params = new URLSearchParams({
    amount: String(Math.round(opts.amountCHF * 100)), // centimes
    currency: 'CHF',
    purpose: opts.purpose,
    referenceId: opts.referenceId,
    successRedirectUrl: opts.returnUrl,
    failedRedirectUrl: opts.returnUrl,
    cancelRedirectUrl: opts.returnUrl,
  })

  const signature = buildSignature(params, opts.apiSecret)
  const url =
    `https://${opts.instance}.payrexx.com/api/v1/Gateway/` +
    `?instance=${opts.instance}&ApiSignature=${signature}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  })

  const json = (await res.json()) as {
    status: string
    message?: string
    data?: Array<{ id: number; link: string }>
  }

  if (json.status !== 'success' || !json.data?.[0]?.link) {
    throw new Error(`PayRexx API: ${json.message ?? JSON.stringify(json)}`)
  }

  return { id: json.data[0].id, link: json.data[0].link }
}
