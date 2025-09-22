const FALLBACK_LOCALE = "en-JM";

export function formatCurrency(amountCents: number, currency: string) {
  const formatter = new Intl.NumberFormat(FALLBACK_LOCALE, {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
  });

  return formatter.format(amountCents / 100);
}
