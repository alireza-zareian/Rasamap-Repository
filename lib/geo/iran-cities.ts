// Iran's provinces and the cities the catalogue lists: the province → city
// selects, the allowlist a `city` filter is checked against
// (lib/explore-query.ts), and each city's centre, which a row's own point is
// checked against (lib/geo/distance.ts). A city missing here cannot be
// filtered to, and its rows fall off the map.

export interface CityLocation {
  name: string;
  lat: number;
  lng: number;
}

export interface ProvinceLocation {
  name: string;            // Persian province name (matches data used across the app)
  center: { lat: number; lng: number };
  cities: CityLocation[];
}

export const provinces: ProvinceLocation[] = [
  { name: "تهران", center: { lat: 35.6892, lng: 51.389 }, cities: [
    { name: "تهران", lat: 35.6892, lng: 51.389 },
    { name: "اسلامشهر", lat: 35.5505, lng: 51.2273 },
    { name: "ورامین", lat: 35.3267, lng: 51.6452 },
    { name: "دماوند", lat: 35.7172, lng: 52.0654 },
    { name: "پردیس", lat: 35.74, lng: 51.8 },
    { name: "شهریار", lat: 35.66, lng: 51.06 },
  ]},
  { name: "البرز", center: { lat: 35.84, lng: 50.9391 }, cities: [
    { name: "کرج", lat: 35.84, lng: 50.9391 },
    { name: "فردیس", lat: 35.7295, lng: 50.9759 },
    { name: "نظرآباد", lat: 35.951, lng: 50.6109 },
    { name: "محمدشهر", lat: 35.76, lng: 50.92 },
    { name: "ساوجبلاغ", lat: 35.96, lng: 50.68 },
  ]},
  { name: "قزوین", center: { lat: 36.2797, lng: 50.0049 }, cities: [
    { name: "قزوین", lat: 36.2797, lng: 50.0049 },
    { name: "تاکستان", lat: 36.0686, lng: 49.6953 },
    { name: "آبیک", lat: 36.0339, lng: 50.5331 },
  ]},
  { name: "قم", center: { lat: 34.6401, lng: 50.8764 }, cities: [
    { name: "قم", lat: 34.6401, lng: 50.8764 },
  ]},
  { name: "مرکزی", center: { lat: 34.0917, lng: 49.6892 }, cities: [
    { name: "اراک", lat: 34.0917, lng: 49.6892 },
    { name: "ساوه", lat: 35.0213, lng: 50.3566 },
    { name: "خمین", lat: 33.6398, lng: 50.0786 },
    { name: "دلیجان", lat: 33.99, lng: 50.68 },
  ]},
  { name: "اصفهان", center: { lat: 32.6546, lng: 51.668 }, cities: [
    { name: "اصفهان", lat: 32.6546, lng: 51.668 },
    { name: "کاشان", lat: 33.985, lng: 51.41 },
    { name: "نجف‌آباد", lat: 32.6345, lng: 51.365 },
    { name: "شاهین‌شهر", lat: 32.8514, lng: 51.553 },
    { name: "شاهین شهر و میمه", lat: 32.86, lng: 51.55 },
    { name: "مبارکه", lat: 32.35, lng: 51.5 },
  ]},
  { name: "یزد", center: { lat: 31.8974, lng: 54.3569 }, cities: [
    { name: "یزد", lat: 31.8974, lng: 54.3569 },
    { name: "میبد", lat: 32.25, lng: 54.0167 },
    { name: "اردکان", lat: 32.31, lng: 54.0175 },
    { name: "مهریز", lat: 31.58, lng: 54.43 },
  ]},
  { name: "فارس", center: { lat: 29.5918, lng: 52.5837 }, cities: [
    { name: "شیراز", lat: 29.5918, lng: 52.5837 },
    { name: "مرودشت", lat: 29.8625, lng: 52.8056 },
    { name: "جهرم", lat: 28.5, lng: 53.5667 },
    { name: "پاسارگاد", lat: 30.2, lng: 53.18 },
  ]},
  { name: "کرمان", center: { lat: 30.2839, lng: 57.0834 }, cities: [
    { name: "کرمان", lat: 30.2839, lng: 57.0834 },
    { name: "رفسنجان", lat: 30.4067, lng: 55.9939 },
    { name: "سیرجان", lat: 29.4519, lng: 55.6814 },
  ]},
  { name: "سیستان و بلوچستان", center: { lat: 29.4963, lng: 60.8629 }, cities: [
    { name: "زاهدان", lat: 29.4963, lng: 60.8629 },
    { name: "زابل", lat: 31.0299, lng: 61.5009 },
    { name: "ایرانشهر", lat: 27.2025, lng: 60.685 },
  ]},
  { name: "هرمزگان", center: { lat: 27.1865, lng: 56.2808 }, cities: [
    { name: "بندرعباس", lat: 27.1865, lng: 56.2808 },
    { name: "قشم", lat: 26.9581, lng: 56.2719 },
    { name: "میناب", lat: 27.1276, lng: 57.0801 },
    { name: "کیش", lat: 26.53, lng: 53.98 },
    { name: "لنگه", lat: 26.56, lng: 54.88 },
  ]},
  { name: "بوشهر", center: { lat: 28.9684, lng: 50.8385 }, cities: [
    { name: "بوشهر", lat: 28.9684, lng: 50.8385 },
    { name: "گناوه", lat: 29.58, lng: 50.5167 },
    { name: "برازجان", lat: 29.2667, lng: 51.2167 },
    { name: "عسلویه", lat: 27.47, lng: 52.61 },
  ]},
  { name: "خوزستان", center: { lat: 31.3183, lng: 48.6706 }, cities: [
    { name: "اهواز", lat: 31.3183, lng: 48.6706 },
    { name: "آبادان", lat: 30.3392, lng: 48.3043 },
    { name: "دزفول", lat: 32.3814, lng: 48.4019 },
    { name: "ماهشهر", lat: 30.56, lng: 49.2 },
    { name: "امیدیه", lat: 30.76, lng: 49.7 },
    { name: "بهبهان", lat: 30.6, lng: 50.24 },
    { name: "ایذه", lat: 31.83, lng: 49.87 },
    { name: "مسجد سلیمان", lat: 31.94, lng: 49.3 },
    { name: "رامهرمز", lat: 31.28, lng: 49.6 },
  ]},
  { name: "کهگیلویه و بویراحمد", center: { lat: 30.6682, lng: 51.588 }, cities: [
    { name: "یاسوج", lat: 30.6682, lng: 51.588 },
    { name: "گچساران", lat: 30.3392, lng: 50.7975 },
  ]},
  { name: "چهارمحال و بختیاری", center: { lat: 32.3258, lng: 50.8645 }, cities: [
    { name: "شهرکرد", lat: 32.3258, lng: 50.8645 },
    { name: "بروجن", lat: 31.9667, lng: 51.3 },
    { name: "لردگان", lat: 31.51, lng: 50.83 },
    { name: "اردل", lat: 31.99, lng: 50.66 },
    { name: "فارسان", lat: 32.26, lng: 50.56 },
    { name: "کوهرنگ", lat: 32.46, lng: 50.13 },
    { name: "کیار", lat: 32.05, lng: 50.82 },
  ]},
  { name: "لرستان", center: { lat: 33.4878, lng: 48.3558 }, cities: [
    { name: "خرم‌آباد", lat: 33.4878, lng: 48.3558 },
    { name: "بروجرد", lat: 33.8975, lng: 48.7517 },
    { name: "خرم آباد", lat: 33.49, lng: 48.36 },
    { name: "سلسله", lat: 33.86, lng: 48.26 },
    { name: "ازنا", lat: 33.46, lng: 49.46 },
  ]},
  { name: "ایلام", center: { lat: 33.6374, lng: 46.4227 }, cities: [
    { name: "ایلام", lat: 33.6374, lng: 46.4227 },
    { name: "دهلران", lat: 32.6941, lng: 47.2667 },
  ]},
  { name: "کرمانشاه", center: { lat: 34.3142, lng: 47.065 }, cities: [
    { name: "کرمانشاه", lat: 34.3142, lng: 47.065 },
    { name: "اسلام‌آبادغرب", lat: 34.1167, lng: 46.5333 },
  ]},
  { name: "کردستان", center: { lat: 35.3219, lng: 46.9862 }, cities: [
    { name: "سنندج", lat: 35.3219, lng: 46.9862 },
    { name: "مریوان", lat: 35.5219, lng: 46.1747 },
    { name: "سقز", lat: 36.25, lng: 46.27 },
    { name: "دیواندره", lat: 35.91, lng: 47.02 },
    { name: "بانه", lat: 35.99, lng: 45.89 },
  ]},
  { name: "همدان", center: { lat: 34.7992, lng: 48.5146 }, cities: [
    { name: "همدان", lat: 34.7992, lng: 48.5146 },
    { name: "ملایر", lat: 34.2967, lng: 48.8175 },
  ]},
  { name: "زنجان", center: { lat: 36.6736, lng: 48.4787 }, cities: [
    { name: "زنجان", lat: 36.6736, lng: 48.4787 },
    { name: "ابهر", lat: 36.1467, lng: 49.2167 },
  ]},
  { name: "آذربایجان شرقی", center: { lat: 38.0962, lng: 46.2738 }, cities: [
    { name: "تبریز", lat: 38.0962, lng: 46.2738 },
    { name: "مرند", lat: 38.4322, lng: 45.7717 },
    { name: "میانه", lat: 37.42, lng: 47.72 },
  ]},
  { name: "آذربایجان غربی", center: { lat: 37.5527, lng: 45.0761 }, cities: [
    { name: "ارومیه", lat: 37.5527, lng: 45.0761 },
    { name: "خوی", lat: 38.5503, lng: 44.9519 },
    { name: "ماکو", lat: 39.29, lng: 44.52 },
  ]},
  { name: "اردبیل", center: { lat: 38.2498, lng: 48.2933 }, cities: [
    { name: "اردبیل", lat: 38.2498, lng: 48.2933 },
    { name: "مشگین‌شهر", lat: 38.3917, lng: 47.6772 },
    { name: "پارس آباد", lat: 39.65, lng: 47.92 },
  ]},
  { name: "گیلان", center: { lat: 37.2808, lng: 49.5832 }, cities: [
    { name: "رشت", lat: 37.2808, lng: 49.5832 },
    { name: "بندرانزلی", lat: 37.4711, lng: 49.4608 },
    { name: "لاهیجان", lat: 37.2069, lng: 50.0061 },
    { name: "انزلی", lat: 37.47, lng: 49.46 },
    { name: "آستارا", lat: 38.43, lng: 48.87 },
    { name: "آستانه اشرفیه", lat: 37.26, lng: 49.94 },
    { name: "رودسر", lat: 37.14, lng: 50.29 },
    { name: "صومعه سرا", lat: 37.31, lng: 49.32 },
    { name: "لنگرود", lat: 37.2, lng: 50.15 },
  ]},
  { name: "مازندران", center: { lat: 36.5633, lng: 53.0601 }, cities: [
    { name: "ساری", lat: 36.5633, lng: 53.0601 },
    { name: "بابل", lat: 36.5513, lng: 52.6791 },
    { name: "آمل", lat: 36.4711, lng: 52.3511 },
    { name: "بهشهر", lat: 36.69, lng: 53.55 },
    { name: "رامسر", lat: 36.92, lng: 50.64 },
    { name: "عباس آباد", lat: 36.72, lng: 51.11 },
    { name: "نور", lat: 36.57, lng: 52.01 },
    { name: "تنکابن", lat: 36.82, lng: 50.87 },
    { name: "محمود آباد", lat: 36.63, lng: 52.26 },
    { name: "کلاردشت", lat: 36.5, lng: 51.14 },
    { name: "چالوس", lat: 36.65, lng: 51.42 },
    { name: "بابلسر", lat: 36.7, lng: 52.65 },
    { name: "نوشهر", lat: 36.65, lng: 51.5 },
    { name: "فریدون کنار", lat: 36.68, lng: 52.52 },
    { name: "سوادکوه", lat: 36.1, lng: 53.05 },
    { name: "قائم شهر", lat: 36.46, lng: 52.86 },
    { name: "گلوگاه", lat: 36.73, lng: 53.81 },
    { name: "نکا", lat: 36.65, lng: 53.3 },
  ]},
  { name: "گلستان", center: { lat: 36.8392, lng: 54.4392 }, cities: [
    { name: "گرگان", lat: 36.8392, lng: 54.4392 },
    { name: "گنبدکاووس", lat: 37.2542, lng: 55.1722 },
    { name: "گنبد کاووس", lat: 37.25, lng: 55.17 },
    { name: "کلاله", lat: 37.38, lng: 55.49 },
    { name: "کردکوی", lat: 36.79, lng: 54.11 },
    { name: "ترکمن", lat: 36.9, lng: 54.07 },
  ]},
  { name: "خراسان شمالی", center: { lat: 37.4747, lng: 57.329 }, cities: [
    { name: "بجنورد", lat: 37.4747, lng: 57.329 },
    { name: "شیروان", lat: 37.4081, lng: 57.9183 },
  ]},
  { name: "خراسان رضوی", center: { lat: 36.2972, lng: 59.6067 }, cities: [
    { name: "مشهد", lat: 36.2972, lng: 59.6067 },
    { name: "نیشابور", lat: 36.2133, lng: 58.7975 },
    { name: "سبزوار", lat: 36.2127, lng: 57.6822 },
    { name: "کاشمر", lat: 35.24, lng: 58.46 },
    { name: "تربت حیدریه", lat: 35.27, lng: 59.22 },
  ]},
  { name: "خراسان جنوبی", center: { lat: 32.8649, lng: 59.2262 }, cities: [
    { name: "بیرجند", lat: 32.8649, lng: 59.2262 },
    { name: "قائنات", lat: 33.7256, lng: 59.1819 },
    { name: "سرایان", lat: 33.86, lng: 58.52 },
  ]},
  { name: "سمنان", center: { lat: 35.5729, lng: 53.3971 }, cities: [
    { name: "سمنان", lat: 35.5729, lng: 53.3971 },
    { name: "شاهرود", lat: 36.4178, lng: 54.9756 },
    { name: "دامغان", lat: 36.1683, lng: 54.3492 },
  ]},
];

export function getProvince(name: string): ProvinceLocation | undefined {
  return provinces.find((p) => p.name === name);
}

// The province a city belongs to, for when only the city is known.
export function findProvinceOfCity(cityName: string): ProvinceLocation | undefined {
  return provinces.find((p) => p.cities.some((c) => c.name === cityName));
}

// A known city's approximate centre, or null. isPlottable() measures a row's
// point against it; a row without a point gets no pin.
export function coordsForCity(cityName: string): { lat: number; lng: number } | null {
  for (const province of provinces) {
    const city = province.cities.find((c) => c.name === cityName);
    if (city) return { lat: city.lat, lng: city.lng };
  }
  return null;
}

/**
 * Names a source files a board under that are not cities. One crawler lists a
 * Mashhad boulevard as a city of its own; left alone, those rows fall outside
 * every province filter and off the map.
 */
const CITY_ALIASES: Record<string, string> = {
  "بلوار وکیل آباد": "مشهد",
};

/** The city a crawled row really belongs to — see CITY_ALIASES. */
export function canonicalCity(name: string): string {
  const trimmed = name.trim();
  return CITY_ALIASES[trimmed] ?? trimmed;
}
