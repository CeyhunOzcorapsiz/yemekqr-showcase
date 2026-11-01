import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { Navigate } from "react-router-dom";
import type { ReactNode } from "react";
import { useAuth } from "./context";
export function ProtectedRoute({
  children,
  adminOnly = false,
}: {
  children: ReactNode;
  adminOnly?: boolean;
}) {
  useI18n();
  const { user, loading, error, retry } = useAuth();
  if (loading)
    return (
      <div className="page" role="status">
        {t("Oturum kontrol ediliyor…")}
      </div>
    );
  if (error)
    return (
      <div className="page">
        <p role="alert" className="error-box">
          {t(error)}
        </p>
        <button className="btn btn-primary" onClick={retry}>
          {t("Tekrar dene")}
        </button>
      </div>
    );
  if (!user) return <Navigate to="/login" replace />;
  if (adminOnly && user.role !== "admin") return <Navigate to="/" replace />;
  return <>{children}</>;
}
