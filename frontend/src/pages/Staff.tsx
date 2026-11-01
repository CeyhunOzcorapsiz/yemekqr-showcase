import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { User, Role } from "../api/client";
import { useAuth } from "../auth/context";
import { Feedback } from "../components/Ui";
export default function Staff() {
  useI18n();
  const { user, retry } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<User | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("kasiyer");
  const [active, setActive] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setUsers(await api.listStaffUsers());
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  function reset() {
    setEditing(null);
    setName("");
    setEmail("");
    setPassword("");
    setRole("kasiyer");
    setActive(true);
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (editing)
        await api.updateStaffUser(editing.id, {
          name,
          role,
          active,
          ...(password ? { password } : {}),
        });
      else await api.createStaffUser({ name, email, password, role });
      const self = editing?.id === user?.id;
      reset();
      setMessage(t("Personel kaydedildi."));
      if (self) retry();
      else await load();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page-wide">
      <h1>{t("Personel yönetimi")}</h1>
      <Feedback error={error} id="page-error" />
      <p role="status">{t(message)}</p>
      <form
        aria-describedby={error ? "page-error" : undefined}
        className="panel form-grid"
        onSubmit={save}
      >
        <h2>{editing ? t("Personeli düzenle") : t("Personel ekle")}</h2>
        <label>
          {t("Ad soyad")}
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label>
          {t("E-posta")}
          <input
            type="email"
            required
            disabled={!!editing}
            maxLength={254}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
          />
        </label>
        <label>
          {editing ? t("Yeni şifre (değişmeyecekse boş bırakın)") : t("Şifre")}
          <input
            type="password"
            required={!editing}
            minLength={8}
            maxLength={72}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="new-password"
          />
        </label>
        <label>
          {t("Yetki")}
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
          >
            <option value="kasiyer">{t("Kasiyer")}</option>
            <option value="admin">{t("Yönetici")}</option>
          </select>
        </label>
        {editing && (
          <label className="check-label">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
            />
            {t("Hesap aktif")}
          </label>
        )}
        <p className="hint">
          {t(
            "Yetki, şifre veya aktiflik değiştiğinde mevcut oturumlar kapatılır. Son aktif yönetici kapatılamaz.",
          )}
        </p>
        <div className="toolbar">
          <button className="btn btn-primary" disabled={busy}>
            {busy ? t("Kaydediliyor…") : t("Kaydet")}
          </button>
          {editing && (
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busy}
              onClick={reset}
            >
              {t("Vazgeç")}
            </button>
          )}
        </div>
      </form>
      <button
        className="btn btn-secondary"
        disabled={busy || loading}
        onClick={() => {
          setError("");
          void load();
        }}
      >
        {t("Listeyi yenile")}
      </button>
      {loading ? (
        <p role="status">{t("Personel yükleniyor…")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption>{t("Restoran personeli")}</caption>
            <thead>
              <tr>
                <th>{t("Ad")}</th>
                <th>{t("E-posta")}</th>
                <th>{t("Yetki")}</th>
                <th>{t("Durum")}</th>
                <th>{t("İşlem")}</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td>{u.name}</td>
                  <td>{u.email}</td>
                  <td>{u.role === "admin" ? t("Yönetici") : t("Kasiyer")}</td>
                  <td>{u.active ? t("Aktif") : t("Kapalı")}</td>
                  <td>
                    <button
                      className="btn btn-secondary"
                      disabled={busy}
                      onClick={() => {
                        setEditing(u);
                        setName(u.name);
                        setEmail(u.email);
                        setRole(u.role);
                        setActive(u.active);
                        setPassword("");
                      }}
                    >
                      {t("Düzenle")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
