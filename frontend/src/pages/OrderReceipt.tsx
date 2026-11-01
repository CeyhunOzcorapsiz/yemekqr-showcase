import { receiptName } from "../i18n/content";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { statusLabel } from "../utils/status";
import { useEffect, useState, type CSSProperties } from "react";
import { Link, useParams } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Order } from "../api/client";
import { useAuth } from "../auth/context";
import { formatTL, formatDate } from "../utils/money";
import { Feedback } from "../components/Ui";
export default function OrderReceipt() {
  useI18n();
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [qr, setQr] = useState("");
  const [error, setError] = useState("");
  const [qrError, setQrError] = useState("");
  const [reload, setReload] = useState(0);
  const [paper, setPaper] = useState("80");
  useEffect(() => {
    const controller = new AbortController();
    setOrder(null);
    setQr("");
    setError("");
    setQrError("");
    if (!id) {
      setError(t("Fiş adresi geçersiz."));
      return;
    }
    api
      .getOrder(id, controller.signal)
      .then(setOrder)
      .catch((e) => {
        if (!controller.signal.aborted) setError(errorMessage(e));
      });
    api
      .getOrderQr(id, controller.signal)
      .then((r) => setQr(r.qrCodeImage))
      .catch((e) => {
        if (!controller.signal.aborted) setQrError(errorMessage(e));
      });
    return () => controller.abort();
  }, [id, reload]);
  return (
    <div
      className="page receipt-page"
      style={
        { "--receipt-width": paper === "58" ? "50mm" : "72mm" } as CSSProperties
      }
    >
      <Feedback error={error} />
      {error && (
        <button
          className="btn btn-secondary no-print"
          onClick={() => setReload((n) => n + 1)}
        >
          {t("Tekrar dene")}
        </button>
      )}
      {!error && !order && <p role="status">{t("Fiş yükleniyor…")}</p>}
      {order && (
        <>
          <h1>{order.restaurant.name}</h1>
          <p className="hint">
            {t("Sipariş #")}
            {order.id.slice(0, 8)} · {formatDate(order.createdAt)}
          </p>
          <p>
            {statusLabel(order.status)} · {statusLabel(order.paymentStatus)}
          </p>
          <div className="receipt-box">
            {order.items.map((item) => (
              <div className="receipt-line" key={item.id}>
                <div>
                  {receiptName(item)}
                  <small>
                    {item.quantity} × {formatTL(item.unitPrice)}
                  </small>
                </div>
                <strong>{formatTL(item.unitPrice * item.quantity)}</strong>
              </div>
            ))}
            <div className="receipt-total">
              <span>{t("Toplam")}</span>
              <span>{formatTL(order.totalAmount)}</span>
            </div>
            {order.refundedAmount > 0 && (
              <div className="receipt-line">
                <span>{t("İade edilen")}</span>
                <span>{formatTL(order.refundedAmount)}</span>
              </div>
            )}
          </div>
          {qr && (
            <div className="qr-box">
              <img
                src={qr}
                alt={t("Bu siparişin fiş bağlantısı")}
                width={180}
                height={180}
              />
            </div>
          )}
          {qrError && (
            <div className="no-print">
              <Feedback error={qrError} />
              <button
                className="btn btn-secondary"
                onClick={() => setReload((n) => n + 1)}
              >
                {t("QR kodunu yeniden yükle")}
              </button>
            </div>
          )}
          <p className="hint">{t("Sipariş özeti · Mali belge değildir.")}</p>
          <div className="toolbar no-print">
            <label>
              {t("Kağıt genişliği")}
              <select value={paper} onChange={(e) => setPaper(e.target.value)}>
                <option value="80">80 mm</option>
                <option value="58">58 mm</option>
              </select>
            </label>
            <button
              className="btn btn-secondary"
              onClick={() => window.print()}
            >
              {t("Yazdır")}
            </button>
            {user && (
              <>
                <Link className="btn btn-primary" to="/new-order">
                  {t("Yeni sipariş")}
                </Link>
                <Link to="/orders">{t("Sipariş geçmişi")}</Link>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
