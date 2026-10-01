export const inr = (rupees: number | null | undefined) => rupees == null || !Number.isFinite(rupees) ? '—'
  : `₹${rupees.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const paise = (value: number | null | undefined) => (value == null ? null : value / 100);
