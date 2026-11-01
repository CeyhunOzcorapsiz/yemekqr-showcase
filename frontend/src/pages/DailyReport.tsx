import { productName } from "../i18n/content";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { DailyReport as Report, AiReport, User } from "../api/client";
import { formatTL, turkeyToday, formatDecimal } from "../utils/money";
import { Feedback } from "../components/Ui";
export default function DailyReport() {
  useI18n();
  const [from, setFrom] = useState(turkeyToday());
  const [to, setTo] = useState(turkeyToday());
  const [method, setMethod] = useState("");
  const [userId, setUserId] = useState("");
  const [staff, setStaff] = useState<User[]>([]);
  const [report, setReport] = useState<Report | null>(null);
  const [ai, setAi] = useState<AiReport | null>(null);
  const [error, setError] = useState("");
  const [aiError, setAiError] = useState("");
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    api
      .listStaffUsers()
      .then(setStaff)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  useEffect(() => {
    const c = new AbortController();
    setLoading(true);
    setError("");
    setAiError("");
    setReport(null);
    setAi(null);
    api
      .getDailyReport({ from, to, method, userId }, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setReport(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setError(errorMessage(e));
      })
      .finally(() => {
        if (!c.signal.aborted) setLoading(false);
      });
    api
      .getAiReport({ from, to }, c.signal)
      .then((r) => {
        if (!c.signal.aborted) setAi(r);
      })
      .catch((e) => {
        if (!c.signal.aborted) setAiError(errorMessage(e));
      });
    return () => c.abort();
  }, [from, to, method, userId, reload]);
  function exportCsv() {
    if (!report) return;
    const cell = (v: string | number) =>
      '"' +
      String(v)
        .replace(/^[=+@-]/, "'" + String(v)[0])
        .replace(/"/g, '""') +
      '"';
    const rows = [
      [t("Ölçüm"), t("Değer")],
      [t("Başlangıç"), report.from],
      [t("Bitiş"), report.to],
      [t("Sipariş tutarı (kuruş)"), report.orderAmount],
      [t("Tahsilat (kuruş)"), report.collected],
      [t("İade (kuruş)"), report.refunds],
      [t("Net tahsilat (kuruş)"), report.totalRevenue],
      [],
      [t("Ürün"), t("Satılan adet")],
      ...report.topProducts.map((p) => [productName(p), p.quantity]),
    ];
    const url = URL.createObjectURL(
      new Blob(
        ["\uFEFF" + rows.map((r) => r.map(cell).join(";")).join("\r\n")],
        { type: "text/csv;charset=utf-8" },
      ),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = "yemekqr-" + from + "-" + to + ".csv";
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <div className="page page-wide">
      <h1>{t("Satış ve tahsilat raporu")}</h1>
      <div className="toolbar">
        <label>
          {t("Başlangıç")}
          <input
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
          />
        </label>
        <label>
          {t("Bitiş")}
          <input
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
          />
        </label>
        <label>
          {t("Siparişi açan personel")}
          <select value={userId} onChange={(e) => setUserId(e.target.value)}>
            <option value="">{t("Tümü")}</option>
            {staff.map((u) => (
              <option value={u.id} key={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          {t("Tahsilat yöntemi")}
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">{t("Tümü")}</option>
            <option value="cash">{t("Nakit")}</option>
            <option value="card">{t("Kart")}</option>
          </select>
        </label>
        <button
          className="btn btn-secondary"
          disabled={loading}
          onClick={() => setReload((n) => n + 1)}
        >
          {t("Yenile")}
        </button>
        <button
          className="btn btn-secondary"
          disabled={!report || loading}
          onClick={exportCsv}
        >
          {t("CSV indir")}
        </button>
      </div>
      <Feedback error={error} />
      {loading && <p role="status">{t("Rapor hazırlanıyor…")}</p>}
      {report && (
        <>
          <p className="hint">
            {t(
              "Türkiye saati · Siparişler oluşturulma, tahsilat ve iadeler kendi işlem tarihlerine göre hesaplanır. Yöntem filtresi yalnızca para hareketlerini sınırlar.",
            )}
          </p>
          <div className="stats">
            <div className="stat-card">
              <strong>{formatTL(report.totalRevenue)}</strong>
              <span>{t("Net tahsilat")}</span>
            </div>
            <div className="stat-card">
              <strong>{formatTL(report.collected)}</strong>
              <span>{t("Tahsilat")}</span>
            </div>
            <div className="stat-card">
              <strong>{formatTL(report.refunds)}</strong>
              <span>{t("İade")}</span>
            </div>
            <div className="stat-card">
              <strong>{report.totalOrders}</strong>
              <span>{t("İptal dışı sipariş")}</span>
            </div>
          </div>
          <p>
            {t("Sipariş toplamı:")} {formatTL(report.orderAmount)}{" "}
            {t("· İptal:")} {report.cancelledOrders}
            {t(". Eski kayıtlarda tahsilat bilgisi bulunmayabilir.")}
          </p>
          <div className="two-columns">
            <section className="panel">
              <h2>{t("En çok satılan ürünler")}</h2>
              <p className="hint">
                {t(
                  "İlk 20 ürün; tam iptal/iade hariç. Kısmi iadelerde ürün adedi düzeltilmez.",
                )}
              </p>
              {report.topProducts.length ? (
                <ol>
                  {report.topProducts.map((p) => (
                    <li key={productName(p)}>
                      {productName(p)} — {p.quantity} {t("adet")}
                    </li>
                  ))}
                </ol>
              ) : (
                <p>{t("Bu aralıkta satış yok.")}</p>
              )}
            </section>
            <section className="panel">
              <h2>{t("Ödeme kırılımı")}</h2>
              {report.byMethod.map((p) => (
                <p key={p.kind + p.method}>
                  {p.method === "cash" ? t("Nakit") : t("Kart")} ·{" "}
                  {p.kind === "payment" ? t("Tahsilat") : t("İade")}:{" "}
                  {formatTL(p.amount)}
                </p>
              ))}
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <h2>{t("Kamera kullanım ölçümleri")}</h2>
        <Feedback error={aiError} />
        {ai ? (
          <>
            <p>
              {ai.analyses} {t("başarılı analiz ·")} {ai.reviewed}{" "}
              {t("siparişe dönüştü ·")} {ai.corrected} {t("düzeltildi.")}
            </p>
            <p>
              {t("Düzeltme oranı:")}{" "}
              {ai.correctionRate === null
                ? t("Henüz veri yok")
                : formatDecimal(ai.correctionRate * 100) + "%"}{" "}
              {t("· Medyan:")}{" "}
              {ai.medianMs === null
                ? "—"
                : formatDecimal(ai.medianMs / 1000) + " " + t("sn")}{" "}
              {t("· P95:")}{" "}
              {ai.p95Ms === null
                ? "—"
                : formatDecimal(ai.p95Ms / 1000) + " " + t("sn")}
            </p>
            <p className="hint">
              {t("Tüm restoran personelini kapsar; seçili tarihlerde en fazla")}{" "}
              {ai.sampleLimit} {t("son başarılı analiz. Modlar:")}{" "}
              {ai.modes
                .map((mode) => (mode === "mock" ? t("Test") : t("Gemini")))
                .join(", ") || "—"}
              {t(". Bu ölçümler model doğruluğu değildir.")}
            </p>
          </>
        ) : (
          !aiError && <p role="status">{t("Kamera ölçümleri yükleniyor…")}</p>
        )}
      </section>
    </div>
  );
}
