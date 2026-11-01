import { LanguageSwitcher } from "./components/LanguageSwitcher";
import { t } from "./i18n/core";
import { useI18n } from "./i18n/react";
import { BrowserRouter, Link, NavLink, Route, Routes } from "react-router-dom";
import { useState } from "react";
import { AuthProvider } from "./auth/AuthContext";
import { useAuth } from "./auth/context";
import { ProtectedRoute } from "./auth/ProtectedRoute";
import { errorMessage } from "./api/client";
import { Feedback } from "./components/Ui";
import Account from "./pages/Account";
import Audit from "./pages/Audit";
import CashShift from "./pages/CashShift";
import Home from "./pages/Home";
import NewOrder from "./pages/NewOrder";
import CameraOrder from "./pages/CameraOrder";
import OrderReceipt from "./pages/OrderReceipt";
import MenuManagement from "./pages/MenuManagement";
import DailyReport from "./pages/DailyReport";
import OrderHistory from "./pages/OrderHistory";
import Staff from "./pages/Staff";
import Login from "./pages/Login";
import RegisterRestaurant from "./pages/RegisterRestaurant";
function Shell() {
  useI18n();
  const { user, restaurant, logout } = useAuth();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function exit() {
    setBusy(true);
    setError("");
    try {
      await logout();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <a className="skip-link no-print" href="#content">
        {t("İçeriğe geç")}
      </a>
      {!user && (
        <div className="language-bar no-print">
          <LanguageSwitcher />
        </div>
      )}
      {user && (
        <header className="app-header no-print">
          <Link className="brand" to="/">
            YemekQR
          </Link>
          <span>
            {restaurant?.name} · {user.name}
          </span>
          <nav aria-label={t("Ana menü")}>
            <NavLink to="/new-order">{t("Sipariş al")}</NavLink>
            <NavLink to="/orders">{t("Geçmiş")}</NavLink>
            <NavLink to="/shift">{t("Kasa vardiyası")}</NavLink>
            <NavLink to="/account">{t("Hesabım")}</NavLink>
            {user.role === "admin" && (
              <>
                <NavLink to="/menu">{t("Menü")}</NavLink>
                <NavLink to="/staff">{t("Personel")}</NavLink>
                <NavLink to="/report">{t("Raporlar")}</NavLink>
                <NavLink to="/audit">{t("Denetim geçmişi")}</NavLink>
              </>
            )}
            <button
              className="btn-link"
              disabled={busy}
              onClick={() => void exit()}
            >
              {t("Çıkış")}
            </button>
          </nav>
          <LanguageSwitcher />
          <Feedback error={error} />
        </header>
      )}
      <main id="content" tabIndex={-1}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<RegisterRestaurant />} />
          <Route path="/receipt/:id" element={<OrderReceipt />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Home />
              </ProtectedRoute>
            }
          />
          <Route
            path="/new-order"
            element={
              <ProtectedRoute>
                <NewOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/camera-order"
            element={
              <ProtectedRoute>
                <CameraOrder />
              </ProtectedRoute>
            }
          />
          <Route
            path="/account"
            element={
              <ProtectedRoute>
                <Account />
              </ProtectedRoute>
            }
          />
          <Route
            path="/audit"
            element={
              <ProtectedRoute adminOnly>
                <Audit />
              </ProtectedRoute>
            }
          />
          <Route
            path="/shift"
            element={
              <ProtectedRoute>
                <CashShift />
              </ProtectedRoute>
            }
          />
          <Route
            path="/orders"
            element={
              <ProtectedRoute>
                <OrderHistory />
              </ProtectedRoute>
            }
          />
          <Route
            path="/menu"
            element={
              <ProtectedRoute adminOnly>
                <MenuManagement />
              </ProtectedRoute>
            }
          />
          <Route
            path="/staff"
            element={
              <ProtectedRoute adminOnly>
                <Staff />
              </ProtectedRoute>
            }
          />
          <Route
            path="/report"
            element={
              <ProtectedRoute adminOnly>
                <DailyReport />
              </ProtectedRoute>
            }
          />
          <Route
            path="*"
            element={
              <div className="page">
                <h1>{t("Sayfa bulunamadı")}</h1>
                <Link to="/">{t("Ana sayfaya dön")}</Link>
              </div>
            }
          />
        </Routes>
      </main>
    </>
  );
}
export default function App() {
  useI18n();
  return (
    <BrowserRouter>
      <AuthProvider>
        <Shell />
      </AuthProvider>
    </BrowserRouter>
  );
}
