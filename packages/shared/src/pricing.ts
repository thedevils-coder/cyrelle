export interface PriceRow {
  product: 'PERSONAL_PREMIUM' | 'BUSINESS_BLUE_TICK';
  interval: 'MONTH' | 'YEAR';
  countryCode: string | null;
  currency: string;
  amountMinor: number;
  active: boolean;
}

export function selectPrice<T extends PriceRow>(rows: T[], product: PriceRow['product'], interval: PriceRow['interval'], countryCode?: string | null): T | null {
  const active = rows.filter((row) => row.active && row.product === product && row.interval === interval);
  const country = countryCode?.toUpperCase() ?? null;
  if (country) {
    const regional = active.find((row) => row.countryCode?.toUpperCase() === country);
    if (regional) return regional;
  }
  return active.find((row) => row.countryCode == null) ?? null;
}
