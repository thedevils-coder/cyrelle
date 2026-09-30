function channel(hex: string, start: number): number {
  const value = parseInt(hex.slice(start, start + 2), 16) / 255;
  return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(hex: string): number {
  const normalized = hex.replace('#', '');
  const r = channel(normalized, 0);
  const g = channel(normalized, 2);
  const b = channel(normalized, 4);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground: string, background: string): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

/** Accent buttons must keep label text at WCAG AA (4.5:1). */
export function accessibleAccentLabel(accentHex: string): { label: '#000000' | '#FFFFFF'; ratio: number } | null {
  if (!/^#?[0-9a-fA-F]{6}$/.test(accentHex)) return null;
  const hex = accentHex.startsWith('#') ? accentHex : `#${accentHex}`;
  const white = contrastRatio('#FFFFFF', hex);
  const black = contrastRatio('#000000', hex);
  const label = white >= black ? '#FFFFFF' : '#000000';
  const ratio = Math.max(white, black);
  if (ratio < 4.5) return null;
  return { label, ratio };
}
