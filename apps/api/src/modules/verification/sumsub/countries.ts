/**
 * ISO 3166-1 alpha-2 to alpha-3. Sumsub fixedInfo.country expects alpha-3.
 * Unknown codes are omitted so the provider level, not Cyrelle, chooses documents.
 */
const ALPHA3: Record<string, string> = {
  AE: 'ARE', AR: 'ARG', AT: 'AUT', AU: 'AUS', BE: 'BEL', BR: 'BRA', CA: 'CAN', CH: 'CHE', CL: 'CHL',
  CN: 'CHN', CO: 'COL', DE: 'DEU', DK: 'DNK', EG: 'EGY', ES: 'ESP', FI: 'FIN', FR: 'FRA', GB: 'GBR',
  GH: 'GHA', GR: 'GRC', HK: 'HKG', ID: 'IDN', IE: 'IRL', IL: 'ISR', IN: 'IND', IT: 'ITA', JP: 'JPN',
  KE: 'KEN', KR: 'KOR', MX: 'MEX', MY: 'MYS', NG: 'NGA', NL: 'NLD', NO: 'NOR', NZ: 'NZL', PH: 'PHL',
  PL: 'POL', PT: 'PRT', QA: 'QAT', SA: 'SAU', SE: 'SWE', SG: 'SGP', TH: 'THA', TR: 'TUR', US: 'USA',
  VN: 'VNM', ZA: 'ZAF',
};

export function toAlpha3Country(code: string | null | undefined): string | null {
  if (!code) return null;
  const upper = code.trim().toUpperCase();
  if (/^[A-Z]{3}$/.test(upper)) return upper;
  return ALPHA3[upper] ?? null;
}
