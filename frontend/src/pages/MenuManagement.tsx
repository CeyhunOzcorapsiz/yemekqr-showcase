import { productName, categoryName } from "../i18n/content";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useCallback, useEffect, useState } from "react";
import { api, errorMessage } from "../api/client";
import type { Product } from "../api/client";
import { formatTL, parseTLToKurus } from "../utils/money";
import { Feedback } from "../components/Ui";
export default function MenuManagement() {
  useI18n();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [nameEn, setNameEn] = useState("");
  const [categoryEn, setCategoryEn] = useState("");
  const [category, setCategory] = useState("");
  const [price, setPrice] = useState("");
  const [filter, setFilter] = useState("all");
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setProducts(await api.getProducts(true));
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
    setNameEn("");
    setCategoryEn("");
    setCategory("");
    setPrice("");
  }
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const amount = parseTLToKurus(price);
    if (!name.trim() || !category.trim() || !Number.isFinite(amount)) {
      setError(
        t("Ad, kategori ve en fazla iki ondalıklı geçerli fiyat girin."),
      );
      return;
    }
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const data = { name, category, nameEn, categoryEn, price: amount };
      if (editing) await api.updateProduct(editing, data);
      else await api.createProduct(data);
      reset();
      await load();
      setMessage(t("Menü kaydedildi."));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function toggle(p: Product) {
    setBusy(true);
    setError("");
    try {
      await api.updateProduct(p.id, { active: !p.active });
      await load();
      setMessage(p.active ? t("Ürün gizlendi.") : t("Ürün yeniden satışta."));
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page-wide">
      <h1>{t("Menü yönetimi")}</h1>
      <Feedback error={error} id="page-error" />
      <p role="status">{t(message)}</p>
      <form
        aria-describedby={error ? "page-error" : undefined}
        className="panel form-grid"
        onSubmit={save}
      >
        <h2>{editing ? t("Ürünü düzenle") : t("Ürün ekle")}</h2>
        <label>
          {t("Ürün adı")}
          <input
            required
            maxLength={120}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
        <label>
          {t("Ürün adı (İngilizce)")}
          <input
            maxLength={120}
            value={nameEn}
            onChange={(e) => setNameEn(e.target.value)}
          />
        </label>
        <label>
          {t("Kategori")}
          <input
            required
            maxLength={120}
            list="categories"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          />
          <datalist id="categories">
            {[...new Set(products.map((p) => p.category))].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>
        <label>
          {t("Kategori (İngilizce)")}
          <input
            maxLength={120}
            value={categoryEn}
            onChange={(e) => setCategoryEn(e.target.value)}
          />
        </label>
        <p className="hint">
          {t(
            "İngilizce alanları doldurarak menü ve fişteki ürün adlarını da çevirebilirsiniz.",
          )}
        </p>
        <label>
          {t("Fiyat (TL)")}
          <input
            required
            inputMode="decimal"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            aria-describedby="price-help"
          />
        </label>
        <p className="hint" id="price-help">
          {t("Örnek: 120,50. En yüksek fiyat 1.000.000 TL.")}
        </p>
        <div className="toolbar">
          <button className="btn btn-primary" disabled={busy}>
            {busy
              ? t("Kaydediliyor…")
              : editing
                ? t("Değişiklikleri kaydet")
                : t("Ürün ekle")}
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
      <div className="toolbar">
        <label>
          {t("Göster")}
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">{t("Tüm ürünler")}</option>
            <option value="active">{t("Satışta")}</option>
            <option value="hidden">{t("Gizli")}</option>
          </select>
        </label>
        <button
          className="btn btn-secondary"
          disabled={busy || loading}
          onClick={() => {
            setError("");
            void load();
          }}
        >
          {t("Yenile")}
        </button>
      </div>
      {loading ? (
        <p role="status">{t("Menü yükleniyor…")}</p>
      ) : (
        <div className="table-scroll">
          <table>
            <caption>{t("Restoran ürünleri")}</caption>
            <thead>
              <tr>
                <th>{t("Ürün")}</th>
                <th>{t("Kategori")}</th>
                <th>{t("Fiyat")}</th>
                <th>{t("Durum")}</th>
                <th>{t("İşlemler")}</th>
              </tr>
            </thead>
            <tbody>
              {products
                .filter(
                  (p) =>
                    filter === "all" ||
                    (filter === "active" ? p.active : !p.active),
                )
                .map((p) => (
                  <tr key={p.id}>
                    <td>{productName(p)}</td>
                    <td>{categoryName(p.category, products)}</td>
                    <td>{formatTL(p.price)}</td>
                    <td>{p.active ? t("Satışta") : t("Gizli")}</td>
                    <td>
                      <div className="toolbar">
                        <button
                          className="btn btn-secondary"
                          disabled={busy}
                          onClick={() => {
                            setEditing(p.id);
                            setName(p.name);
                            setNameEn(p.nameEn || "");
                            setCategoryEn(p.categoryEn || "");
                            setCategory(p.category);
                            setPrice((p.price / 100).toFixed(2));
                          }}
                        >
                          {t("Düzenle")}
                        </button>
                        <button
                          className="btn-link"
                          disabled={busy}
                          onClick={() => void toggle(p)}
                        >
                          {p.active ? t("Gizle") : t("Satışa aç")}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          {!products.length && <p>{t("Henüz ürün yok.")}</p>}
        </div>
      )}
    </div>
  );
}
