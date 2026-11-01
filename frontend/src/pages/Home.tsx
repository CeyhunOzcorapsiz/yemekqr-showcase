import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { DailyReport } from "../api/client";
import { useAuth } from "../auth/context";
import { formatTL } from "../utils/money";
import { Feedback } from "../components/Ui";
export default function Home() {
  useI18n();
  const { user } = useAuth();
  const [report, setReport] = useState<DailyReport | null>(null);
  const [error, setError] = useState("");
  const [camera, setCamera] = useState<boolean | null>(null);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let current = true;
    setError("");
    api
      .capabilities()
      .then((r) => {
        if (current) setCamera(r.camera);
      })
      .catch(() => {
        if (current) setCamera(false);
      });
    if (user?.role === "admin")
      api
        .getDailyReport()
        .then((r) => {
          if (current) setReport(r);
        })
        .catch((e) => {
          if (current) setError(errorMessage(e));
        });
    return () => {
      current = false;
    };
  }, [user, reload]);
  return (
    <div className="page">
      <p className="eyebrow">{t("KASA")}</p>
      <h1>{t("Siparişe hazır")}</h1>
      <p>{t("Menüden hızlıca seçin veya tabağı kamerayla analiz edin.")}</p>
      <Link to="/new-order" className="btn btn-primary btn-large">
        {t("Manuel sipariş al")}
      </Link>
      {camera ? (
        <Link to="/camera-order" className="btn btn-secondary btn-large">
          {t("Kamerayla sipariş hazırla")}
        </Link>
      ) : (
        <p className="hint" role="status">
          {camera === null
            ? t("Kamera servisi kontrol ediliyor…")
            : t(
                "Kamera servisi şu an hazır değil. Manuel sipariş çalışmaya devam ediyor.",
              )}
        </p>
      )}
      <button className="btn-link" onClick={() => setReload((n) => n + 1)}>
        {t("Durumu yenile")}
      </button>
      {user?.role === "admin" && (
        <>
          <Feedback error={error} />
          {report && (
            <div className="stats">
              <div className="stat-card">
                <strong>{formatTL(report.totalRevenue)}</strong>
                <span>{t("Bugünkü net tahsilat")}</span>
              </div>
              <div className="stat-card">
                <strong>{report.totalOrders}</strong>
                <span>{t("Bugünkü sipariş")}</span>
              </div>
            </div>
          )}
          <Link to="/report">{t("Ayrıntılı rapora git →")}</Link>
        </>
      )}
    </div>
  );
}
