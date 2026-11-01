import { productName, categoryName } from "../i18n/content";
import { t, getLocale } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useOrderSubmit } from "../hooks/useOrderSubmit";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Product, PaymentMethod } from "../api/client";
import { formatTL } from "../utils/money";
import { Feedback, PaymentSelect, Quantity } from "../components/Ui";
interface CartLine {
  product: Product;
  quantity: number;
}
export default function NewOrder() {
  useI18n();
  const navigate = useNavigate();
  const [products, setProducts] = useState<Product[]>([]);
  const [cart, setCart] = useState<Record<string, CartLine>>({});
  const [menuLoading, setMenuLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const submit = useOrderSubmit();
  const load = useCallback(async () => {
    setMenuLoading(true);
    setError("");
    try {
      const list = await api.getProducts();
      setProducts(list);
      setCart((old) =>
        Object.fromEntries(
          Object.entries(old).flatMap(([id, line]) => {
            const product = list.find((p) => p.id === id);
            return product ? [[id, { ...line, product }]] : [];
          }),
        ),
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setMenuLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const categories = useMemo(
    () => [...new Set(products.map((p) => p.category))],
    [products],
  );
  const visible = products.filter(
    (p) =>
      (!category || p.category === category) &&
      [p.name, p.nameEn || ""].some((name) =>
        name
          .toLocaleLowerCase(getLocale())
          .includes(search.toLocaleLowerCase(getLocale())),
      ),
  );
  const lines = Object.values(cart);
  const total = lines.reduce((sum, l) => sum + l.product.price * l.quantity, 0);
  function add(product: Product) {
    setCart((old) => ({
      ...old,
      [product.id]: {
        product,
        quantity: Math.min(1000, (old[product.id]?.quantity || 0) + 1),
      },
    }));
  }
  function change(id: string, delta: number) {
    setCart((old) => {
      const next = { ...old };
      const line = next[id];
      if (!line) return old;
      const quantity = line.quantity + delta;
      if (quantity <= 0) delete next[id];
      else next[id] = { ...line, quantity: Math.min(1000, quantity) };
      return next;
    });
  }
  async function confirm() {
    if (busy || !lines.length) return;
    setBusy(true);
    setError("");
    try {
      const order = await submit(
        lines.map((l) => ({
          productId: l.product.id,
          quantity: l.quantity,
          expectedUnitPrice: l.product.price,
        })),
        payment,
      );
      navigate("/receipt/" + order.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="page page-wide">
      <div className="page-header">
        <h1>{t("Yeni sipariş")}</h1>
        <Link to="/camera-order">{t("Kamerayla hazırla")}</Link>
      </div>
      <Feedback error={error} />
      <div className="order-layout">
        <section aria-label={t("Menü")}>
          <div className="toolbar">
            <label>
              {t("Ürün ara")}
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("Yemek adı")}
              />
            </label>
            <label>
              {t("Kategori")}
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option value="">{t("Tüm kategoriler")}</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {categoryName(c, products)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-secondary"
              disabled={busy || menuLoading}
              onClick={() => void load()}
            >
              {t("Menüyü yenile")}
            </button>
          </div>
          {menuLoading ? (
            <p role="status">{t("Menü yükleniyor…")}</p>
          ) : !products.length ? (
            <p>{t("Menü boş. Yönetici ürün ekledikten sonra yenileyin.")}</p>
          ) : !visible.length ? (
            <p>{t("Aramanıza uygun ürün yok.")}</p>
          ) : (
            <div className="product-grid">
              {visible.map((p) => (
                <button
                  className="product-card"
                  key={p.id}
                  disabled={busy}
                  onClick={() => add(p)}
                >
                  <span className="hint">
                    {categoryName(p.category, products)}
                  </span>
                  <strong>{productName(p)}</strong>
                  <span>{formatTL(p.price)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
        <aside className="cart-panel" aria-label={t("Sepet")}>
          <div className="page-header">
            <h2>{t("Sepet")}</h2>
            <button
              className="btn-link"
              disabled={busy || !lines.length}
              onClick={() => setCart({})}
            >
              {t("Temizle")}
            </button>
          </div>
          {!lines.length && <p className="hint">{t("Menüden ürün seçin.")}</p>}
          {lines.map((l) => (
            <div className="cart-line" key={l.product.id}>
              <div>
                <strong>{productName(l.product)}</strong>
                <div className="hint">
                  {formatTL(l.product.price)} {t("/ adet")}
                </div>
              </div>
              <Quantity
                name={productName(l.product)}
                value={l.quantity}
                onChange={(d) => change(l.product.id, d)}
                disabled={busy}
              />
              <span>{formatTL(l.product.price * l.quantity)}</span>
            </div>
          ))}
          <div className="cart-total">
            <span>{t("Toplam")}</span>
            <span>{formatTL(total)}</span>
          </div>
          <PaymentSelect
            value={payment}
            onChange={setPayment}
            disabled={busy}
          />
          <button
            className="btn btn-primary btn-large"
            disabled={
              busy || menuLoading || !lines.length || total > 2_000_000_000
            }
            onClick={() => void confirm()}
          >
            {busy ? t("Kaydediliyor…") : t("Onayla ve fişi oluştur")}
          </button>
          <p className="hint">
            {t(
              "Kart seçimi, harici POS cihazında tahsilatın tamamlandığını kaydeder.",
            )}
          </p>
        </aside>
      </div>
    </div>
  );
}
