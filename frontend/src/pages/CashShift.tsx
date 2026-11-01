import { useEffect, useRef, useState } from "react";
import { api, errorMessage, type Shift } from "../api/client";
import { Feedback } from "../components/Ui";
import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import { formatDate, formatTL, parseTLToKurus } from "../utils/money";

export default function CashShift() {
  useI18n();
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [opening, setOpening] = useState("0"),
    [counted, setCounted] = useState(""),
    [note, setNote] = useState("");
  const [kind, setKind] = useState<"in" | "out">("in"),
    [amount, setAmount] = useState(""),
    [reason, setReason] = useState("");
  const movementKey = useRef(crypto.randomUUID());
  const active = shifts.find((s) => !s.closedAt);
  async function refresh() {
    setShifts(await api.listShifts());
  }
  useEffect(() => {
    api
      .listShifts()
      .then(setShifts)
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await refresh();
    } catch (e) {
      setError(errorMessage(e));
      try {
        await refresh();
      } catch {
        /* preserve original error */
      }
    } finally {
      setBusy(false);
    }
  }
  function value(input: string) {
    return parseTLToKurus(input, 2_000_000_000);
  }
  return (
    <div className="page page-wide">
      <h1>{t("Kasa vardiyası")}</h1>
      <p className="hint">
        {t("Vardiya dışında yapılan işlemler bu hesaba dahil edilmez.")}{" "}
        {t("Açılış tutarı ve sayım sıfır olabilir.")}
      </p>
      <Feedback error={error ? t(error) : ""} />
      {loading ? (
        <p role="status">{t("Vardiya bilgileri yükleniyor…")}</p>
      ) : !active ? (
        <section className="panel">
          <p>{t("Açık vardiya yok.")}</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const n = value(opening);
              if (!Number.isFinite(n)) {
                setError(t("Tutarı kontrol edin."));
                return;
              }
              void run(() => api.openShift(n));
            }}
          >
            <label>
              {t("Açılış nakdi (TL)")}{" "}
              <input
                required
                inputMode="decimal"
                value={opening}
                onChange={(e) => setOpening(e.target.value)}
              />
            </label>{" "}
            <button className="btn" disabled={busy}>
              {t("Vardiya aç")}
            </button>
          </form>
        </section>
      ) : (
        <>
          <section className="panel">
            <p>
              {t("Açılış")}: {formatDate(active.openedAt)} · {t("Açan")}:{" "}
              {active.openedBy.name}
            </p>
            <div className="stats">
              {(
                [
                  ["Açılış nakdi (TL)", active.openingCash],
                  ["Nakit tahsilat", active.cashIn],
                  ["Nakit iade", active.cashRefund],
                  ["Kasaya giriş", active.deposits],
                  ["Kasadan çıkış", active.withdrawals],
                  ["Kart tahsilat", active.cardIn],
                  ["Kart iade", active.cardRefund],
                  ["Beklenen nakit", active.currentExpectedCash],
                ] as [string, number][]
              ).map(([label, n]) => (
                <div className="stat-card" key={label}>
                  <strong>{formatTL(n)}</strong>
                  <span>{t(label)}</span>
                </div>
              ))}
            </div>
          </section>
          <div className="two-columns">
            <section className="panel">
              <h2>{t("Kasa hareketleri")}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = value(amount);
                  if (!Number.isFinite(n) || n <= 0) {
                    setError(t("Tutarı kontrol edin."));
                    return;
                  }
                  if (reason.trim().length < 3) {
                    setError(t("Nakit hareketinin nedenini girin."));
                    return;
                  }
                  const key = movementKey.current;
                  void run(async () => {
                    await api.addCashMovement(
                      active.id,
                      { kind, amount: n, reason: reason.trim() },
                      key,
                    );
                    movementKey.current = crypto.randomUUID();
                    setAmount("");
                    setReason("");
                  });
                }}
              >
                <label>
                  {t("Kasa hareketleri")}{" "}
                  <select
                    value={kind}
                    onChange={(e) => {
                      setKind(e.target.value as "in" | "out");
                      movementKey.current = crypto.randomUUID();
                    }}
                  >
                    <option value="in">{t("Kasaya giriş")}</option>
                    <option value="out">{t("Kasadan çıkış")}</option>
                  </select>
                </label>
                <label>
                  {t("Tutar (TL)")}{" "}
                  <input
                    required
                    inputMode="decimal"
                    value={amount}
                    onChange={(e) => {
                      setAmount(e.target.value);
                      movementKey.current = crypto.randomUUID();
                    }}
                  />
                </label>
                <label>
                  {t("Açıklama")}{" "}
                  <input
                    required
                    minLength={3}
                    maxLength={500}
                    value={reason}
                    onChange={(e) => {
                      setReason(e.target.value);
                      movementKey.current = crypto.randomUUID();
                    }}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  {t("Hareket ekle")}
                </button>
              </form>
              <ul>
                {active.movements.map((m) => (
                  <li key={m.id}>
                    {formatDate(m.createdAt)} ·{" "}
                    {t(m.kind === "in" ? "Kasaya giriş" : "Kasadan çıkış")} ·{" "}
                    {formatTL(m.amount)} · {m.reason}
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h2>{t("Vardiyayı kapat")}</h2>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const n = value(counted);
                  if (!Number.isFinite(n)) {
                    setError(t("Tutarı kontrol edin."));
                    return;
                  }
                  void run(() => api.closeShift(active.id, n, note));
                }}
              >
                <label>
                  {t("Sayılan nakit (TL)")}{" "}
                  <input
                    required
                    inputMode="decimal"
                    value={counted}
                    onChange={(e) => setCounted(e.target.value)}
                  />
                </label>
                <label>
                  {t("Kapanış notu")}{" "}
                  <textarea
                    maxLength={500}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </label>
                <button className="btn" disabled={busy}>
                  {t("Vardiyayı kapat")}
                </button>
              </form>
            </section>
          </div>
        </>
      )}
      <section className="panel">
        <h2>{t("Vardiya geçmişi")}</h2>
        <p className="hint">{t("Son 50 vardiya gösterilir.")}</p>
        {!shifts.length && !loading && <p>{t("Vardiya kaydı yok.")}</p>}
        {shifts.map((s) => (
          <details key={s.id}>
            <summary>
              {formatDate(s.openedAt)} · {s.openedBy.name} ·{" "}
              {t(s.closedAt ? "Kapanmış" : "Açık")}
            </summary>
            <p>
              {t("Açılış nakdi (TL)")}: {formatTL(s.openingCash)} ·{" "}
              {t("Nakit tahsilat")}: {formatTL(s.cashIn)} · {t("Nakit iade")}:{" "}
              {formatTL(s.cashRefund)} · {t("Kasaya giriş")}:{" "}
              {formatTL(s.deposits)} · {t("Kasadan çıkış")}:{" "}
              {formatTL(s.withdrawals)}
            </p>
            {s.closedAt && (
              <>
                <p>
                  {t("Kapatan")}: {s.closedBy?.name} · {formatDate(s.closedAt)}
                </p>
                <p>
                  {t("Beklenen nakit")}: {formatTL(s.expectedCash!)} ·{" "}
                  {t("Sayılan nakit")}: {formatTL(s.countedCash!)} ·{" "}
                  {t("Kasa farkı")}: {formatTL(s.difference!)}
                </p>
                {s.note && (
                  <p>
                    {t("Kapanış notu")}: {s.note}
                  </p>
                )}
              </>
            )}
            <ul>
              {s.movements.map((m) => (
                <li key={m.id}>
                  {formatDate(m.createdAt)} ·{" "}
                  {t(m.kind === "in" ? "Kasaya giriş" : "Kasadan çıkış")} ·{" "}
                  {formatTL(m.amount)} · {m.reason}
                </li>
              ))}
            </ul>
          </details>
        ))}
      </section>
    </div>
  );
}
