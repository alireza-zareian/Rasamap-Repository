import { z } from "zod";
import { latinDigits } from "./digits.ts";

/** An Iranian mobile number as the catalogue stores it: 09 and nine digits. */
export const MOBILE_RE = /^09\d{9}$/;

/** A mobile number from a form, in whatever digits the keyboard typed. */
export const MobileNumber = (message = "شماره موبایل معتبر نیست") =>
  z.string().trim().transform(latinDigits).pipe(z.string().regex(MOBILE_RE, message));
