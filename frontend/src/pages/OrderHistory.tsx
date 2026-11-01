import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { newId } from "../utils/id";
import { statusLabel } from "../utils/status";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Order } from "../api/client";
import { useAuth } from "../auth/context";
import {
  formatTL,
  formatDate,
  parseTLToKurus,
  turkeyToday,
} from "../utils/money";
import { Feedback } from "../components/Ui";
export default function OrderHistory() {
  useI18n();
  const { user } = useAuth();
  const [data, setData] = useState<Order[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [from, setFrom] = useState(turkeyToday());
  const [to, setTo] = useState(turkeyToday());
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<{
    order: Order;
    action: "cancel" | "refund" | "payment";
  } | null>(null);
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("cash");
  const key = useRef("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    api
      .listOrders({ from, to, q, status, page }, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setData(r.data);
          setTotal(r.total);
        }
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    return () => c.abort();
  }, [from, to, q, status, page, reload]);
  function select(order: Order, action: "cancel" | "refund" | "payment") {
    setSelected({ order, action });
    setReason("");
    setAmount(((order.totalAmount - order.refundedAmount) / 100).toFixed(2));
    key.current = newId();
    setError("");
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || busy) return;
    const value = parseTLToKurus(amount, 2_000_000_000);
    if (selected.action === "refund" && !Number.isFinite(value)) {
      setError(t("Geçerli bir iade tutarı girin."));
      return;
    }
    setBusy(true);
    setError("");
    try {
      await api.orderAction(
        selected.order.id,
        selected.action,
        selected.action === "payment"
          ? { method }
          : {
              reason,
              ...(selected.action === "refund" ? { amount: value } : {}),
            },
        key.current,
      );
      setSelected(null);
      setReload((n) => n + 1);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page-wide">
      <h1>{t("Sipariş geçmişi")}</h1>
      <div className="toolbar">
        <label>
          {t("Başlangıç")}
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t("Bitiş")}
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t("Fiş numarası")}
          <input
            type="search"
            maxLength={120}
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setPage(1);
            }}
          />
        </label>
        <label>
          {t("Durum")}
          <select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("Tümü")}</option>
            {["pending", "completed", "cancelled", "refunded"].map((s) => (
              <option key={s} value={s}>
                {statusLabel(s)}
              </option>
            ))}
          </select>
        </label>
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => setReload((n) => n + 1)}
        >
          {t("Yenile")}
        </button>
      </div>
      <Feedback error={error} id="page-error" />
      {selected && (
        <form
          aria-describedby={error ? "page-error" : undefined}
          className="panel form-grid"
          onSubmit={submit}
        >
          <h2>
            {selected.action === "payment"
              ? t("Tahsilat kaydet")
              : selected.action === "cancel"
                ? t("Siparişi iptal et")
                : t("İade kaydet")}{" "}
            · #{selected.order.id.slice(0, 8)}
          </h2>
          {selected.action === "payment" ? (
            <label>
              {t("Ödeme türü")}
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value)}
              >
                <option value="cash">{t("Nakit")}</option>
                <option value="card">{t("Kart")}</option>
              </select>
            </label>
          ) : (
            <>
              <label>
                {t("İşlem gerekçesi")}
                <textarea
                  required
                  minLength={3}
                  maxLength={500}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              </label>
              {selected.action === "refund" && (
                <label>
                  {t("İade tutarı (TL)")}
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                  />
                </label>
              )}
              <p className="hint">
                {t(
                  "Bu işlem yalnızca kaydı günceller. Kart iadesini ödeme cihazında ayrıca tamamlayın.",
                )}
              </p>
            </>
          )}
          <div className="toolbar">
            <button className="btn btn-primary" disabled={busy}>
              {busy ? t("İşleniyor…") : t("İşlemi onayla")}
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => setSelected(null)}
            >
              {t("Vazgeç")}
            </button>
          </div>
        </form>
      )}
      {loading ? (
        <p role="status">{t("Siparişler yükleniyor…")}</p>
      ) : (
        !error && (
          <>
            <p>
              {total} {t("sipariş")}
            </p>
            <div className="table-scroll">
              <table>
                <caption>{t("Siparişler · Türkiye saati")}</caption>
                <thead>
                  <tr>
                    <th>{t("Fiş / Zaman")}</th>
                    <th>{t("Kasiyer")}</th>
                    <th>{t("Durum")}</th>
                    <th>{t("Tutar / İade")}</th>
                    <th>{t("İşlemler")}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <Link to={"/receipt/" + order.id}>
                          #{order.id.slice(0, 8)}
                        </Link>
                        <small>{formatDate(order.createdAt)}</small>
                      </td>
                      <td>{order.user?.name || t("Eski kayıt")}</td>
                      <td>
                        {statusLabel(order.status)}
                        <small>{statusLabel(order.paymentStatus)}</small>
                      </td>
                      <td>
                        {formatTL(order.totalAmount)}
                        {order.refundedAmount > 0 && (
                          <small>
                            {t("İade:")} {formatTL(order.refundedAmount)}
                          </small>
                        )}
                      </td>
                      <td>
                        <div className="toolbar">
                          {order.status === "pending" && (
                            <button
                              className="btn btn-secondary"
                              onClick={() => select(order, "payment")}
                            >
                              {t("Tahsil et")}
                            </button>
                          )}
                          {user?.role === "admin" &&
                            !["cancelled", "refunded"].includes(
                              order.status,
                            ) && (
                              <>
                                <button
                                  className="btn-link"
                                  onClick={() => select(order, "cancel")}
                                >
                                  {t("İptal")}
                                </button>
                                {["paid", "partial_refund"].includes(
                                  order.paymentStatus,
                                ) && (
                                  <button
                                    className="btn-link"
                                    onClick={() => select(order, "refund")}
                                  >
                                    {t("İade")}
                                  </button>
                                )}
                              </>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {!data.length && <p>{t("Bu filtrelerde sipariş yok.")}</p>}
            </div>
            <div className="toolbar">
              <button
                className="btn btn-secondary"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                {t("Önceki")}
              </button>
              <span>
                {t("Sayfa")} {page}
              </span>
              <button
                className="btn btn-secondary"
                disabled={page * 25 >= total}
                onClick={() => setPage((p) => p + 1)}
              >
                {t("Sonraki")}
              </button>
            </div>
          </>
        )
      )}
    </div>
  );
}
