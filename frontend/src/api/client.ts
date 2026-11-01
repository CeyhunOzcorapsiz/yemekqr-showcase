import { getLanguage } from "../i18n/core";
import { errorMessages } from "../i18n/errors";
import { t } from "../i18n/core";
const API_URL =
  (import.meta.env.VITE_API_URL || "").replace(/\/$/, "") + "/api";
import type {
  Product,
  Order,
  DailyReport,
  AiReport,
  DetectResult,
  User,
  Role,
  PaymentMethod,
  AuthResponse,
  CreateItem,
} from "../../../shared/contracts";
export type * from "../../../shared/contracts";
export class ApiError extends Error {
  status: number;
  code: string;
  constructor(message: string, status: number, code: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? errorMessages[error.code] || "İstek tamamlanamadı."
    : "Beklenmeyen bir hata oluştu.";
async function request<T>(
  path: string,
  options: RequestInit = {},
  timeoutMs = 15000,
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(API_URL + path, {
      ...options,
      credentials: "include",
      headers: {
        ...(options.body instanceof FormData
          ? {}
          : { "Content-Type": "application/json" }),
        "Accept-Language": getLanguage(),
        ...options.headers,
      },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new ApiError(
      t(
        "Sunucuya ulaşılamadı veya işlem zaman aşımına uğradı. Siparişi tekrar denerken aynı işlem korunur.",
      ),
      0,
      "NETWORK_ERROR",
    );
  }
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const detail =
      body && typeof body === "object"
        ? (body as { error?: string; code?: string })
        : {};
    if (
      res.status === 401 &&
      !path.startsWith("/auth/login") &&
      !path.startsWith("/auth/me")
    )
      window.dispatchEvent(new Event("yemekqr:unauthorized"));
    throw new ApiError(
      detail.error || t("İstek tamamlanamadı."),
      res.status,
      detail.code || "REQUEST_FAILED",
    );
  }
  if (body === null)
    throw new ApiError(
      t("Sunucudan geçerli veri alınamadı."),
      502,
      "INVALID_RESPONSE",
    );
  return body as T;
}
const json = (method: string, body: unknown, key?: string): RequestInit => ({
  method,
  body: JSON.stringify(body),
  ...(key ? { headers: { "Idempotency-Key": key } } : {}),
});
const query = (params: Record<string, string | number | undefined>) => {
  const result = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== "") result.set(k, String(v));
  });
  return result.toString();
};
export type Shift = {
  id: string;
  openingCash: number;
  countedCash: number | null;
  expectedCash: number | null;
  difference: number | null;
  note: string | null;
  openedAt: string;
  closedAt: string | null;
  openedBy: { name: string };
  closedBy: { name: string } | null;
  cashIn: number;
  cashRefund: number;
  cardIn: number;
  cardRefund: number;
  deposits: number;
  withdrawals: number;
  currentExpectedCash: number;
  movements: {
    id: string;
    kind: "in" | "out";
    amount: number;
    reason: string;
    createdAt: string;
  }[];
};
export type AuditEntry = {
  id: string;
  action: string;
  entityId: string;
  createdAt: string;
  userName: string | null;
  detail: Record<string, unknown>;
};
export const api = {
  changePassword: (currentPassword: string, newPassword: string) =>
    request<{ ok: boolean }>(
      "/auth/change-password",
      json("POST", { currentPassword, newPassword }),
    ),
  listAudit: (
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ) =>
    request<{ total: number; page: number; data: AuditEntry[] }>(
      "/audit?" + query(params),
      { signal },
    ),
  listShifts: () => request<Shift[]>("/shifts"),
  openShift: (openingCash: number) =>
    request<Shift>("/shifts", json("POST", { openingCash })),
  addCashMovement: (
    id: string,
    data: { kind: "in" | "out"; amount: number; reason: string },
    key: string,
  ) => request("/shifts/" + id + "/movements", json("POST", data, key)),
  closeShift: (id: string, countedCash: number, note: string) =>
    request<Shift>(
      "/shifts/" + id + "/close",
      json("POST", { countedCash, note }),
    ),
  registerRestaurant: (data: {
    restaurantName: string;
    adminName: string;
    email: string;
    password: string;
  }) => request<AuthResponse>("/auth/register-restaurant", json("POST", data)),
  login: (data: { email: string; password: string }) =>
    request<AuthResponse>("/auth/login", json("POST", data)),
  logout: () => request<{ ok: boolean }>("/auth/logout", json("POST", {})),
  me: () => request<AuthResponse>("/auth/me"),
  capabilities: () =>
    request<{ camera: boolean; demo: boolean }>("/capabilities"),
  createStaffUser: (data: {
    name: string;
    email: string;
    password: string;
    role: Role;
  }) => request<User>("/auth/users", json("POST", data)),
  listStaffUsers: () => request<User[]>("/auth/users"),
  updateStaffUser: (
    id: string,
    data: { name?: string; role?: Role; active?: boolean; password?: string },
  ) => request<User>("/auth/users/" + id, json("PUT", data)),
  getProducts: (all = false, signal?: AbortSignal) =>
    request<Product[]>("/products" + (all ? "?active=all" : ""), { signal }),
  createProduct: (data: { name: string; category: string; price: number }) =>
    request<Product>("/products", json("POST", data)),
  updateProduct: (id: string, data: Partial<Product>) =>
    request<Product>("/products/" + id, json("PUT", data)),
  createOrder: (
    items: CreateItem[],
    options: {
      key: string;
      paymentMethod: PaymentMethod;
      detectionSessionId?: string;
    },
  ) =>
    request<Order>(
      "/orders",
      json(
        "POST",
        {
          items,
          paymentMethod: options.paymentMethod,
          detectionSessionId: options.detectionSessionId,
        },
        options.key,
      ),
    ),
  listOrders: (
    params: Record<string, string | number | undefined>,
    signal?: AbortSignal,
  ) =>
    request<{ data: Order[]; total: number; page: number; pageSize: number }>(
      "/orders?" + query(params),
      { signal },
    ),
  getOrder: (id: string, signal?: AbortSignal) =>
    request<Order>("/orders/" + id, { signal }),
  getOrderQr: (id: string, signal?: AbortSignal) =>
    request<{ qrCodeImage: string }>("/orders/" + id + "/qr", { signal }),
  orderAction: (
    id: string,
    action: "cancel" | "refund" | "payment",
    data: { reason?: string; amount?: number; method?: string },
    key: string,
  ) => request<Order>("/orders/" + id + "/" + action, json("POST", data, key)),
  getDailyReport: (
    params: Record<string, string | undefined> = {},
    signal?: AbortSignal,
  ) => request<DailyReport>("/reports/daily?" + query(params), { signal }),
  getAiReport: (
    params: Record<string, string | undefined> = {},
    signal?: AbortSignal,
  ) => request<AiReport>("/reports/ai?" + query(params), { signal }),
  detectImage: (blob: Blob, signal?: AbortSignal) => {
    const form = new FormData();
    form.append("image", blob, "tabak");
    return request<DetectResult>(
      "/detect",
      { method: "POST", body: form, signal },
      40000,
    );
  },
};
