import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import { useAuth } from "../auth/context";
import { Feedback } from "../components/Ui";
export default function AuthForm({ register = false }: { register?: boolean }) {
  useI18n();
  const { user, login, registerRestaurant } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [restaurant, setRestaurant] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [demo, setDemo] = useState(false);
  useEffect(() => {
    api
      .capabilities()
      .then((r) => setDemo(r.demo))
      .catch(() => {});
  }, []);
  if (user) return <Navigate to={register ? "/menu" : "/"} replace />;
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (register)
        await registerRestaurant({
          restaurantName: restaurant,
          adminName: name,
          email,
          password,
        });
      else await login(email, password);
      navigate(register ? "/menu" : "/");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page auth-page">
      <Link className="brand" to="/">
        YemekQR
      </Link>
      <h1>{register ? t("Restoranını oluştur") : t("Giriş yap")}</h1>
      <Feedback error={error} id="page-error" />
      <form
        aria-describedby={error ? "page-error" : undefined}
        className="auth-form"
        onSubmit={submit}
      >
        {register && (
          <>
            <label>
              {t("Restoran adı")}
              <input
                required
                maxLength={120}
                autoComplete="organization"
                value={restaurant}
                onChange={(e) => setRestaurant(e.target.value)}
              />
            </label>
            <label>
              {t("Yönetici adı soyadı")}
              <input
                required
                maxLength={120}
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
          </>
        )}
        <label>
          {t("E-posta")}
          <input
            type="email"
            required
            maxLength={254}
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label>
          {t("Şifre")}
          <input
            type="password"
            required
            minLength={register ? 8 : 1}
            maxLength={72}
            autoComplete={register ? "new-password" : "current-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={register ? "password-help" : undefined}
          />
        </label>
        {register && (
          <p className="hint" id="password-help">
            {t(
              "En az 8 karakter. Çok baytlı karakterlerle birlikte en fazla 72 bayt.",
            )}
          </p>
        )}
        <button className="btn btn-primary btn-large" disabled={busy}>
          {busy
            ? t("İşleniyor…")
            : register
              ? t("Restoranı oluştur")
              : t("Giriş yap")}
        </button>
      </form>
      <p>
        {register ? t("Hesabın var mı?") : t("Yeni restoran mı?")}{" "}
        <Link to={register ? "/login" : "/register"}>
          {register ? t("Giriş yap") : t("Restoran kaydet")}
        </Link>
      </p>
      {demo && !register && (
        <p className="hint">
          {t("Demo: admin@demo.com veya kasiyer@demo.com · Şifre: demo1234")}
        </p>
      )}
    </div>
  );
}
