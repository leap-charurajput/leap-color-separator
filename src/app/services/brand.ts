/*
 * Fallback brand for a separation whose style has no Brand in Styles.xlsx: the profile name's first
 * segment ("Fanatics_Plastisol_Cotton" -> "Fanatics", "Nike_DTF" -> "Nike"). The host only shows a
 * Footer sublayer that matches it, so an unexpected prefix leaves the template's footers untouched.
 */
export function brandFromProfileName(profileName: string | null | undefined): string {
 const first = String(profileName || '').trim().split(/[_\s-]+/)[0] || '';
 return /^[A-Za-z]+$/.test(first) ? first : '';
}
