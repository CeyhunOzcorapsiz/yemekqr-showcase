import { useRef } from "react";
import { api } from "../api/client";
import type { CreateItem, PaymentMethod } from "../api/client";
import { useAuth } from "../auth/context";
import { newId } from "../utils/id";
interface Attempt {
  fingerprint: string;
  key: string;
}
export function useOrderSubmit() {
  const attempt = useRef<Attempt | null>(null);
  const { user } = useAuth();
  return async (
    items: CreateItem[],
    paymentMethod: PaymentMethod,
    detectionSessionId?: string,
  ) => {
    const canonical = [...items].sort((a, b) =>
      a.productId.localeCompare(b.productId),
    );
    const fingerprint = JSON.stringify({
      items: canonical,
      paymentMethod,
      detectionSessionId,
    });
    const storageKey = "yemekqr:pending-order:" + user?.id;
    if (!attempt.current) {
      try {
        const previous = JSON.parse(
          sessionStorage.getItem(storageKey) || "null",
        ) as Attempt | null;
        if (
          previous?.fingerprint === fingerprint &&
          /^[a-f0-9-]{36}$/i.test(previous.key)
        )
          attempt.current = previous;
      } catch {
        /* Storage may be unavailable. */
      }
    }
    if (attempt.current?.fingerprint !== fingerprint)
      attempt.current = { fingerprint, key: newId() };
    try {
      sessionStorage.setItem(storageKey, JSON.stringify(attempt.current));
    } catch {
      /* In-memory retry still works. */
    }
    const order = await api.createOrder(items, {
      key: attempt.current.key,
      paymentMethod,
      detectionSessionId,
    });
    attempt.current = null;
    try {
      sessionStorage.removeItem(storageKey);
    } catch {
      /* No auth secrets are stored here. */
    }
    return order;
  };
}
