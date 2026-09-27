/**
 * Persian (۰–۹) and Arabic-Indic (٠–٩) digits, as Latin ones.
 *
 * A phone on a Persian keyboard types these for numbers, and they are
 * different characters: "۱۲۳" is not "123" to a regular expression or to
 * bcrypt. The sign-in form converted them and the reset form did not, so a
 * password reset to "۱۲۳۴۵۶۷۸" could never be typed back in. The server now
 * converts every mobile number and password it reads, so no form has to
 * remember to.
 */
const PERSIAN = "۰۱۲۳۴۵۶۷۸۹";
const ARABIC = "٠١٢٣٤٥٦٧٨٩";

export function latinDigits(s: string): string {
  return s
    .replace(/[۰-۹]/g, d => String(PERSIAN.indexOf(d)))
    .replace(/[٠-٩]/g, d => String(ARABIC.indexOf(d)));
}
