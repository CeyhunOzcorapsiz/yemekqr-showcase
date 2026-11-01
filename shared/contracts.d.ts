// JSON contract shared by browser and server domain types.
export type Role = "admin" | "kasiyer";
export type PaymentMethod = "cash" | "card" | "unpaid";
export interface Product {
  id: string;
  name: string;
  category: string;
  nameEn?: string | null;
  categoryEn?: string | null;
  price: number;
  active: boolean;
}
export interface OrderItem {
  id: string;
  productId: string;
  productName: string;
  productNameEn?: string | null;
  quantity: number;
  unitPrice: number;
  source: "manual" | "ai_detected";
}
export interface Order {
  id: string;
  status: string;
  paymentStatus: string;
  totalAmount: number;
  refundedAmount: number;
  qrCodeValue: string;
  createdAt: string;
  restaurant: { name: string };
  items: OrderItem[];
  user?: { name: string };
  payments?: { method: string; kind: string; amount: number }[];
}
export interface DailyReport {
  date: string;
  from: string;
  to: string;
  timezone: string;
  totalOrders: number;
  cancelledOrders: number;
  orderAmount: number;
  collected: number;
  refunds: number;
  totalRevenue: number;
  topProducts: { name: string; nameEn?: string | null; quantity: number }[];
  byMethod: { method: string; kind: string; amount: number }[];
}
export interface AiReport {
  analyses: number;
  reviewed: number;
  corrected: number;
  removed: number;
  added: number;
  correctionRate: number | null;
  medianMs: number | null;
  p95Ms: number | null;
  sampleLimit: number;
  modes: string[];
}
export interface Detection {
  nameEn?: string | null;
  productId: string;
  name: string;
  price: number;
  confidence: number;
}
export interface DetectResult {
  mode: string;
  model: string;
  sessionId: string;
  detections: Detection[];
}
export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  restaurantId: string;
  active: boolean;
}
export interface Restaurant {
  id: string;
  name: string;
  timezone: string;
}
export interface AuthResponse {
  user: User;
  restaurant: Restaurant;
}
export interface CreateItem {
  productId: string;
  quantity: number;
  expectedUnitPrice: number;
  source?: "manual" | "ai_detected";
}
