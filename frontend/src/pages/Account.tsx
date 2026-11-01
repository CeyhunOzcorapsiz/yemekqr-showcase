import { useState } from "react";
import { api, errorMessage } from "../api/client";
import { Feedback } from "../components/Ui";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
export default function Account() {
  useI18n();
  const [current, setCurrent] = useState(""),
    [next, setNext] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setMessage("");
    if (next !== confirmation) {
      setError("Şifreler eşleşmiyor.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(current, next);
      setCurrent("");
      setNext("");
      setConfirmation("");
      setMessage("Şifre güncellendi. Diğer oturumlar kapatıldı.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page">
      <h1>{t("Hesabım")}</h1>
      <h2>{t("Şifre değiştir")}</h2>
      <Feedback error={error} />
      <p role="status">{t(message)}</p>
      <form className="panel form-grid" onSubmit={submit}>
        <label>
          {t("Mevcut şifre")}
          <input
            type="password"
            autoComplete="current-password"
            required
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label>
          {t("Yeni şifre")}
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={next}
            onChange={(e) => setNext(e.target.value)}
          />
        </label>
        <label>
          {t("Yeni şifre tekrarı")}
          <input
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
            maxLength={72}
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
          />
        </label>
        <button className="btn btn-primary" disabled={busy}>
          {t("Şifre değiştir")}
        </button>
      </form>
      <p className="hint">
        {t("Şifrenizi unuttuysanız yöneticinizden destek alın.")}
      </p>
    </div>
  );
}
