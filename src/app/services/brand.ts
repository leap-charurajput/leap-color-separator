/*
 * Fallback brand for a separation whose style has no Brand in Styles.xlsx: the profile name's first
 * segment ("Fanatics_Plastisol_Cotton" -> "Fanatics", "Nike_DTF" -> "Nike"). The host only shows a
 * Footer sublayer that matches it, so an unexpected prefix leaves the template's footers untouched.
 */
export function brandFromProfileName(profileName: string | null | undefined): string {
 const first = String(profileName || '').trim().split(/[_\s-]+/)[0] || '';
 return /^[A-Za-z]+$/.test(first) ? first : '';
}

/*
 * The footer brand the profile itself names: "Nike" or "Fanatics", else ''. It wins over the
 * Styles.xlsx Brand column, because a profile picked in Add Separation (e.g. Nike_HSWB_Cotton for a
 * style whose row says Fanatics) is the user's choice for this separation.
 */
const PROFILE_FOOTER_BRANDS = ['Nike', 'Fanatics'];

export function footerBrandFromProfileName(profileName: string | null | undefined): string {
 const first = brandFromProfileName(profileName).toLowerCase();
 return PROFILE_FOOTER_BRANDS.find((b) => b.toLowerCase() === first) || '';
}
