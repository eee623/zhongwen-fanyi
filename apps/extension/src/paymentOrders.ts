type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

export type PaymentProvider = "alipay" | "wechat";
export type PaymentPackageId = "pro_20m_cny_39";

export interface CreatePaymentOrderInput {
  provider: PaymentProvider;
  packageId: PaymentPackageId;
}

export interface PaymentOrderCheckout {
  mode: "provider_redirect_pending";
  checkoutUrl?: string;
}

export interface PaymentOrder {
  orderId: string;
  provider: PaymentProvider;
  userId: string;
  packageId: PaymentPackageId;
  paidMinutes: number;
  amountCents: number;
  currency: "CNY";
  status: "pending";
  checkout: PaymentOrderCheckout;
}

export type CreatePaymentOrderResult =
  | {
      ok: true;
      order: PaymentOrder;
    }
  | {
      ok: false;
      error: string;
    };

export function paymentOrdersEndpointForLiveUrl(liveUrl: string): string {
  const url = new URL(liveUrl);
  if (url.protocol === "ws:") {
    url.protocol = "http:";
  }
  if (url.protocol === "wss:") {
    url.protocol = "https:";
  }
  url.pathname = "/v1/payment-orders";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function createPaymentOrder(
  liveUrl: string,
  credential: string,
  input: CreatePaymentOrderInput,
  fetchImpl: FetchLike = fetch
): Promise<CreatePaymentOrderResult> {
  try {
    const response = await fetchImpl(paymentOrdersEndpointForLiveUrl(liveUrl), {
      method: "POST",
      headers: {
        authorization: `Bearer ${credential}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        provider: input.provider,
        packageId: input.packageId
      })
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      return { ok: false, error: typeof body.error === "string" ? body.error : "订单创建失败" };
    }
    return { ok: true, order: normalizePaymentOrder(body) };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : "订单创建失败" };
  }
}

export function checkoutUrlFromPaymentOrder(order: PaymentOrder): string | undefined {
  const checkoutUrl = order.checkout.checkoutUrl;
  if (!checkoutUrl) {
    return undefined;
  }

  try {
    const url = new URL(checkoutUrl);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function paymentOrderNotice(order: PaymentOrder): string {
  return `已创建${providerLabel(order.provider)}订单 ${order.orderId}，${order.paidMinutes} 分钟 / ${formatCny(order.amountCents)}`;
}

function normalizePaymentOrder(body: Record<string, unknown>): PaymentOrder {
  return {
    orderId: readString(body.orderId),
    provider: readProvider(body.provider),
    userId: readString(body.userId),
    packageId: readPackageId(body.packageId),
    paidMinutes: readNumber(body.paidMinutes),
    amountCents: readNumber(body.amountCents),
    currency: "CNY",
    status: "pending",
    checkout: normalizeCheckout(body.checkout)
  };
}

function normalizeCheckout(value: unknown): PaymentOrderCheckout {
  const checkout = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const checkoutUrl = typeof checkout.checkoutUrl === "string" ? checkout.checkoutUrl : undefined;
  return {
    mode: "provider_redirect_pending",
    checkoutUrl: checkoutUrl ? safeHttpsUrl(checkoutUrl) : undefined
  };
}

function safeHttpsUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function readProvider(value: unknown): PaymentProvider {
  return value === "wechat" ? "wechat" : "alipay";
}

function readPackageId(value: unknown): PaymentPackageId {
  return value === "pro_20m_cny_39" ? value : "pro_20m_cny_39";
}

function readString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function readNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function providerLabel(provider: PaymentProvider): string {
  return provider === "wechat" ? "微信" : "支付宝";
}

function formatCny(amountCents: number): string {
  return `¥${(amountCents / 100).toFixed(2)}`;
}

async function readJsonBody(response: Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
