/**
 * Persian (۰–۹) and Arabic-Indic (٠–٩) digits as Latin ones. "۱۲۳" is not "123"
 * to a regex or to bcrypt, so the server converts every mobile number and
 * password it reads — a form that forgot once made a password untypeable.
 */
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC = "٠١٢٣٤٥٦٧٨٩";

export function latinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, d => String(PERSIAN.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(ARABIC.indexOf(d)));
}
