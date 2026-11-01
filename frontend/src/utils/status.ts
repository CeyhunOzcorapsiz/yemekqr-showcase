import { t } from "../i18n/core";
export const statusLabel = (status: string) =>
  ({
    pending: t("Ödeme bekliyor"),
    completed: t("Tamamlandı"),
    cancelled: t("İptal"),
    refunded: t("İade edildi"),
    paid: t("Ödendi"),
    unpaid: t("Ödenmedi"),
    partial_refund: t("Kısmi iade"),
  })[status] || status;
