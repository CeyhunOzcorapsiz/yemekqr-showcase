import { productName } from "../i18n/content";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { useOrderSubmit } from "../hooks/useOrderSubmit";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, errorMessage } from "../api/client";
import type { Product, PaymentMethod } from "../api/client";
import { formatTL } from "../utils/money";
import { Feedback, Quantity, PaymentSelect } from "../components/Ui";
interface Line {
  productId: string;
  name: string;
  nameEn?: string | null;
  price: number;
  quantity: number;
  confidence: number | null;
}
export default function CameraOrder() {
  useI18n();
  const navigate = useNavigate();
  const video = useRef<HTMLVideoElement>(null);
  const stream = useRef<MediaStream | null>(null);
  const detection = useRef<AbortController | null>(null);
  const [stage, setStage] = useState<"camera" | "loading" | "review">("camera");
  const [ready, setReady] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [error, setError] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [lines, setLines] = useState<Line[]>([]);
  const [selected, setSelected] = useState("");
  const [mode, setMode] = useState("");
  const [session, setSession] = useState("");
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<PaymentMethod>("cash");
  const submit = useOrderSubmit();
  const load = useCallback(async () => {
    try {
      const list = await api.getProducts();
      setProducts(list);
      setLines((old) =>
        old.flatMap((l) => {
          const p = list.find((p) => p.id === l.productId);
          return p
            ? [{ ...l, name: p.name, nameEn: p.nameEn, price: p.price }]
            : [];
        }),
      );
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
    return () => detection.current?.abort();
  }, [load]);
  useEffect(() => {
    if (stage !== "camera") return;
    let current = true;
    setReady(false);
    setCameraError("");
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        t(
          "Bu bağlantıda kamera kullanılamıyor. HTTPS ile açın veya dosya yükleyin.",
        ),
      );
      return;
    }
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: "environment" } })
      .then((s) => {
        if (!current) {
          s.getTracks().forEach((t) => t.stop());
          return;
        }
        stream.current = s;
        if (video.current) video.current.srcObject = s;
      })
      .catch(() => {
        if (current)
          setCameraError(
            t(
              "Kameraya erişilemedi. İzni kontrol edin veya fotoğraf yükleyin.",
            ),
          );
      });
    return () => {
      current = false;
      stream.current?.getTracks().forEach((t) => t.stop());
      stream.current = null;
    };
  }, [stage]);
  async function detect(blob: Blob) {
    if (blob.size > 8 * 1024 * 1024) {
      setError(t("Fotoğraf en fazla 8 MB olabilir."));
      return;
    }
    if (detection.current && !detection.current.signal.aborted) return;
    const controller = new AbortController();
    detection.current = controller;
    setStage("loading");
    setError("");
    try {
      const result = await api.detectImage(blob, controller.signal);
      if (controller.signal.aborted) return;
      setMode(result.mode);
      setSession(result.sessionId);
      setLines(result.detections.map((d) => ({ ...d, quantity: 1 })));
      setStage("review");
    } catch (e) {
      if (!controller.signal.aborted) {
        setError(errorMessage(e));
        setStage("camera");
      }
    } finally {
      if (detection.current === controller) detection.current = null;
    }
  }
  function capture() {
    const v = video.current;
    if (!v || !ready || !v.videoWidth || !v.videoHeight) {
      setError(t("Kamera henüz hazır değil."));
      return;
    }
    const canvas = document.createElement("canvas");
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    canvas.getContext("2d")?.drawImage(v, 0, 0);
    canvas.toBlob(
      (blob) => {
        if (blob) void detect(blob);
        else setError(t("Fotoğraf alınamadı. Tekrar deneyin."));
      },
      "image/jpeg",
      0.9,
    );
  }
  function change(id: string, delta: number) {
    setLines((old) =>
      old
        .map((l) =>
          l.productId === id
            ? { ...l, quantity: Math.min(1000, l.quantity + delta) }
            : l,
        )
        .filter((l) => l.quantity > 0),
    );
  }
  function add() {
    const product = products.find((p) => p.id === selected);
    if (!product) return;
    setLines((old) =>
      old.some((l) => l.productId === product.id)
        ? old.map((l) =>
            l.productId === product.id
              ? { ...l, quantity: Math.min(1000, l.quantity + 1) }
              : l,
          )
        : [
            ...old,
            {
              productId: product.id,
              name: product.name,
              nameEn: product.nameEn,
              price: product.price,
              quantity: 1,
              confidence: null,
            },
          ],
    );
    setSelected("");
  }
  async function confirm() {
    if (!lines.length || busy) return;
    setBusy(true);
    setError("");
    try {
      const order = await submit(
        lines.map((l) => ({
          productId: l.productId,
          quantity: l.quantity,
          expectedUnitPrice: l.price,
          source: l.confidence === null ? "manual" : "ai_detected",
        })),
        payment,
        session,
      );
      navigate("/receipt/" + order.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  const total = lines.reduce((sum, l) => sum + l.quantity * l.price, 0);
  return (
    <div className="page">
      <div className="page-header">
        <h1>
          {stage === "review"
            ? t("Ürünleri kontrol et")
            : t("Tabağı fotoğrafla")}
        </h1>
        <Link to="/new-order">{t("Manuel sipariş")}</Link>
      </div>
      <Feedback error={error} />
      <button
        className="btn-link"
        disabled={busy || stage === "loading"}
        onClick={() => void load()}
      >
        {t("Menüyü ve fiyatları yenile")}
      </button>
      {stage === "camera" && (
        <section className="camera-box">
          {cameraError ? (
            <p className="warning-box" role="status">
              {t(cameraError)}
            </p>
          ) : (
            <video
              ref={video}
              autoPlay
              playsInline
              muted
              onLoadedData={() => setReady(true)}
              className="camera-video"
              aria-label={t("Tabak kamera görüntüsü")}
            />
          )}
          <button
            className="btn btn-primary btn-large"
            disabled={!ready || !!cameraError}
            onClick={capture}
          >
            {t("Fotoğraf çek")}
          </button>
          <label>
            {t("Fotoğraf yükle")}
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void detect(file);
                e.target.value = "";
              }}
            />
          </label>
          <p className="hint">
            {t("Tabağı üstten çekin. Desteklenen türler JPEG, PNG, WebP.")}
          </p>
        </section>
      )}
      {stage === "loading" && (
        <div className="panel">
          <p role="status">{t("Fotoğraf analiz ediliyor…")}</p>
          <button
            className="btn btn-secondary"
            onClick={() => {
              detection.current?.abort();
              detection.current = null;
              setStage("camera");
            }}
          >
            {t("Analizi iptal et")}
          </button>
        </div>
      )}
      {stage === "review" && (
        <>
          {mode === "mock" && (
            <p className="warning-box" role="alert">
              {t(
                "Test modu: ürünler rastgele seçildi. Gerçek tabak analizi yapılmadı.",
              )}
            </p>
          )}
          <p>
            {t(
              "Önerileri kontrol edin; eksik ürünü ekleyin, yanlış ürünü kaldırın.",
            )}
          </p>
          {!lines.length && (
            <p>{t("Ürün bulunamadı. Aşağıdan elle ekleyebilirsiniz.")}</p>
          )}
          {lines.map((l) => (
            <div className="cart-line" key={l.productId}>
              <div>
                <strong>{productName(l)}</strong>
                <small>
                  {l.confidence === null
                    ? t("Elle eklendi")
                    : l.confidence < 0.7
                      ? t("Düşük güven · kontrol edin")
                      : t("Model önerisi · kontrol edin")}
                </small>
              </div>
              <Quantity
                name={productName(l)}
                value={l.quantity}
                onChange={(d) => change(l.productId, d)}
                disabled={busy}
              />
              <span>{formatTL(l.price * l.quantity)}</span>
              <button
                className="btn-link"
                disabled={busy}
                aria-label={l.name + t(" kaldır")}
                onClick={() =>
                  setLines((old) =>
                    old.filter((x) => x.productId !== l.productId),
                  )
                }
              >
                {t("Kaldır")}
              </button>
            </div>
          ))}
          <div className="toolbar">
            <label>
              {t("Ürün ekle")}
              <select
                value={selected}
                disabled={busy}
                onChange={(e) => setSelected(e.target.value)}
              >
                <option value="">{t("Ürün seçin")}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {productName(p)} · {formatTL(p.price)}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="btn btn-secondary"
              disabled={!selected || busy}
              onClick={add}
            >
              {t("Ekle")}
            </button>
          </div>
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
            disabled={!lines.length || busy || total > 2_000_000_000}
            onClick={() => void confirm()}
          >
            {busy ? t("Kaydediliyor…") : t("Kontrol ettim, fişi oluştur")}
          </button>
          <button
            className="btn btn-secondary"
            disabled={busy}
            onClick={() => setStage("camera")}
          >
            {t("Yeni fotoğraf çek")}
          </button>
        </>
      )}
    </div>
  );
}
