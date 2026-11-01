import { useEffect, useState } from "react";
import { api, errorMessage, type AuditEntry } from "../api/client";
import { Feedback } from "../components/Ui";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { formatDate, formatTL } from "../utils/money";
const actions: Record<string, string> = {
  "order.created": "Sipariş oluşturuldu",
  "order.paid": "Tahsilat alındı",
  "order.cancel": "Sipariş iptal edildi",
  "order.refund": "İade yapıldı",
  "product.created": "Ürün oluşturuldu",
  "product.updated": "Ürün güncellendi",
  "product.hidden": "Ürün gizlendi",
  "staff.created": "Personel oluşturuldu",
  "staff.updated": "Personel güncellendi",
  "shift.opened": "Vardiya açıldı",
  "shift.movement": "Kasa hareketi",
  "shift.closed": "Vardiya kapatıldı",
  "account.password_changed": "Şifre değiştirildi",
};
const keys: Record<string, string> = {
  before: "Önce",
  after: "Sonra",
  name: "Ad",
  price: "Fiyat",
  active: "Aktif",
  role: "Rol",
  passwordChanged: "Şifre değişikliği",
  totalAmount: "Toplam tutar",
  paymentMethod: "Ödeme yöntemi",
  method: "Yöntem",
  reason: "Neden",
  amount: "Tutar",
  kind: "Hareket türü",
  openingCash: "Açılış bakiyesi",
  countedCash: "Sayılan tutar",
  expectedCash: "Beklenen tutar",
  difference: "Fark",
  note: "Not",
};
const money = new Set([
  "price",
  "totalAmount",
  "amount",
  "openingCash",
  "countedCash",
  "expectedCash",
  "difference",
]);
function showValue(key: string, value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return t(value ? "Evet" : "Hayır");
  if (typeof value === "number" && money.has(key)) return formatTL(value);
  if (typeof value === "object")
    return Object.entries(value)
      .map(([k, v]) => `${t(keys[k] || k)}: ${showValue(k, v)}`)
      .join(" · ");
  const labels: Record<string, string> = {
    cash: "Nakit",
    card: "Kart",
    unpaid: "Ödeme bekliyor",
    in: "Kasaya giriş",
    out: "Kasadan çıkış",
    admin: "Yönetici",
    kasiyer: "Kasiyer",
  };
  return typeof value === "string" && labels[value]
    ? t(labels[value])
    : String(value);
}
export default function Audit() {
  useI18n();
  const [rows, setRows] = useState<AuditEntry[]>([]),
    [total, setTotal] = useState(0),
    [page, setPage] = useState(1);
  const [action, setAction] = useState(""),
    [from, setFrom] = useState(""),
    [to, setTo] = useState("");
  const [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    if (!!from !== !!to) {
      setRows([]);
      setLoading(false);
      return () => c.abort();
    }
    api
      .listAudit({ action, from, to, page }, c.signal)
      .then((r) => {
        if (!c.signal.aborted) {
          setRows(r.data);
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
  }, [action, from, to, page]);
  return (
    <div className="page page-wide">
      <h1>{t("Denetim geçmişi")}</h1>
      <div className="toolbar">
        <label>
          {t("İşlem türü")}
          <select
            value={action}
            onChange={(e) => {
              setAction(e.target.value);
              setPage(1);
            }}
          >
            <option value="">{t("Tüm işlemler")}</option>
            {Object.entries(actions).map(([code, label]) => (
              <option key={code} value={code}>
                {t(label)}
              </option>
            ))}
          </select>
        </label>
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
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => {
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          {t("Tarih aralığını temizle")}
        </button>
      </div>
      <Feedback error={error} />
      {loading ? (
        <p role="status">{t("Denetim kayıtları yükleniyor…")}</p>
      ) : !rows.length ? (
        <p>{t("Kayıt bulunamadı.")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>{t("Tarih")}</th>
                <th>{t("İşlemi yapan")}</th>
                <th>{t("İşlem türü")}</th>
                <th>{t("Kayıt kimliği")}</th>
                <th>{t("Detaylar")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id}>
                  <td>{formatDate(row.createdAt)}</td>
                  <td>{row.userName || t("Bilinmeyen kullanıcı")}</td>
                  <td>{t(actions[row.action] || row.action)}</td>
                  <td>{row.entityId}</td>
                  <td>
                    {Object.entries(row.detail).map(([key, value]) => (
                      <div key={key}>
                        {t(keys[key] || key)}: {showValue(key, value)}
                      </div>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <div className="toolbar">
        <button
          className="btn btn-secondary"
          disabled={page <= 1 || loading}
          onClick={() => setPage(page - 1)}
        >
          {t("Önceki")}
        </button>
        <span>{t("Sayfa {page}", { page })}</span>
        <button
          className="btn btn-secondary"
          disabled={page * 25 >= total || loading}
          onClick={() => setPage(page + 1)}
        >
          {t("Sonraki")}
        </button>
      </div>
    </div>
  );
}
