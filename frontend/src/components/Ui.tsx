import { t } from "../i18n/core";
import { useI18n } from "../i18n/react";
import type { PaymentMethod } from "../api/client";
export function Feedback({ error, id }: { error: string; id?: string }) {
  useI18n();
  return error ? (
    <p className="error-box" role="alert" id={id}>
      {t(error)}
    </p>
  ) : null;
}
export function Quantity({
  name,
  value,
  onChange,
  disabled = false,
}: {
  name: string;
  value: number;
  onChange: (delta: number) => void;
  disabled?: boolean;
}) {
  useI18n();
  return (
    <div className="qty-control">
      <button
        type="button"
        disabled={disabled}
        aria-label={name + t(" azalt")}
        onClick={() => onChange(-1)}
      >
        −
      </button>
      <span aria-label={t("Adet")}>{value}</span>
      <button
        type="button"
        disabled={disabled || value >= 1000}
        aria-label={name + t(" artır")}
        onClick={() => onChange(1)}
      >
        +
      </button>
    </div>
  );
}
export function PaymentSelect({
  value,
  onChange,
  disabled = false,
}: {
  value: PaymentMethod;
  onChange: (v: PaymentMethod) => void;
  disabled?: boolean;
}) {
  useI18n();
  return (
    <label>
      {t("Ödeme")}
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as PaymentMethod)}
      >
        <option value="cash">{t("Nakit tahsil edildi")}</option>
        <option value="card">{t("Kart ile tahsil edildi")}</option>
        <option value="unpaid">{t("Ödeme bekliyor")}</option>
      </select>
    </label>
  );
}
