import type { ListingPlan } from "@/lib/domain/listing";

/**
 * The two listing plans as a visitor reads them: the form's picker and the
 * landing page's owners section draw the same words, so a price changed here
 * changes everywhere it is quoted.
 */
export const PLANS: { key: ListingPlan; title: string; price: string; perks: string[] }[] = [
  {
    key: "free",
    title: "رایگان",
    price: "۰ تومان",
    perks: ["نمایش در جستجو و صفحهٔ رسانه", "نمایش شمارهٔ تماس به کاربران عضو", "تأیید توسط کارشناس رسامپ"],
  },
  {
    key: "featured",
    title: "ویژه",
    price: "۴۹۰٬۰۰۰ تومان / ۳۰ روز",
    perks: ["همهٔ امکانات پلن رایگان", "نمایش در ابتدای نتایج جستجو", "نشان «ویژه» روی کارت رسانه"],
  },
];
