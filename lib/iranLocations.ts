// ============================================================
// RASAMAP — Iran Provinces & Cities geographic dataset
// Used to power the Province → City cascading selector on the
// map page, and to auto-center/zoom the map to the chosen area.
// ============================================================

export interface CityLocation {
  name: string;
  lat: number;
  lng: number;
  zoom: number; // leaflet zoom level used when this city is selected
}

export interface ProvinceLocation {
  name: string;            // Persian province name (matches data used across the app)
  center: { lat: number; lng: number };
  zoom: number;             // leaflet zoom level used when only the province is selected
  cities: CityLocation[];
}

// Default view of the whole country (used when both selectors are cleared)
export const IRAN_OVERVIEW = { lat: 32.4279, lng: 53.688, zoom: 5 };

export const provinces: ProvinceLocation[] = [
  { name: "تهران", center: { lat: 35.6892, lng: 51.389 }, zoom: 9, cities: [
    { name: "تهران", lat: 35.6892, lng: 51.389, zoom: 11 },
    { name: "اسلامشهر", lat: 35.5505, lng: 51.2273, zoom: 13 },
    { name: "ورامین", lat: 35.3267, lng: 51.6452, zoom: 13 },
    { name: "دماوند", lat: 35.7172, lng: 52.0654, zoom: 13 },
  ]},
  { name: "البرز", center: { lat: 35.84, lng: 50.9391 }, zoom: 10, cities: [
    { name: "کرج", lat: 35.84, lng: 50.9391, zoom: 12 },
    { name: "فردیس", lat: 35.7295, lng: 50.9759, zoom: 13 },
    { name: "نظرآباد", lat: 35.951, lng: 50.6109, zoom: 13 },
  ]},
  { name: "قزوین", center: { lat: 36.2797, lng: 50.0049 }, zoom: 9, cities: [
    { name: "قزوین", lat: 36.2797, lng: 50.0049, zoom: 12 },
    { name: "تاکستان", lat: 36.0686, lng: 49.6953, zoom: 13 },
    { name: "آبیک", lat: 36.0339, lng: 50.5331, zoom: 13 },
  ]},
  { name: "قم", center: { lat: 34.6401, lng: 50.8764 }, zoom: 10, cities: [
    { name: "قم", lat: 34.6401, lng: 50.8764, zoom: 12 },
  ]},
  { name: "مرکزی", center: { lat: 34.0917, lng: 49.6892 }, zoom: 9, cities: [
    { name: "اراک", lat: 34.0917, lng: 49.6892, zoom: 12 },
    { name: "ساوه", lat: 35.0213, lng: 50.3566, zoom: 13 },
    { name: "خمین", lat: 33.6398, lng: 50.0786, zoom: 13 },
  ]},
  { name: "اصفهان", center: { lat: 32.6546, lng: 51.668 }, zoom: 9, cities: [
    { name: "اصفهان", lat: 32.6546, lng: 51.668, zoom: 11 },
    { name: "کاشان", lat: 33.985, lng: 51.41, zoom: 13 },
    { name: "نجف‌آباد", lat: 32.6345, lng: 51.365, zoom: 13 },
    { name: "شاهین‌شهر", lat: 32.8514, lng: 51.553, zoom: 13 },
  ]},
  { name: "یزد", center: { lat: 31.8974, lng: 54.3569 }, zoom: 9, cities: [
    { name: "یزد", lat: 31.8974, lng: 54.3569, zoom: 12 },
    { name: "میبد", lat: 32.25, lng: 54.0167, zoom: 13 },
    { name: "اردکان", lat: 32.31, lng: 54.0175, zoom: 13 },
  ]},
  { name: "فارس", center: { lat: 29.5918, lng: 52.5837 }, zoom: 9, cities: [
    { name: "شیراز", lat: 29.5918, lng: 52.5837, zoom: 11 },
    { name: "مرودشت", lat: 29.8625, lng: 52.8056, zoom: 13 },
    { name: "جهرم", lat: 28.5, lng: 53.5667, zoom: 13 },
  ]},
  { name: "کرمان", center: { lat: 30.2839, lng: 57.0834 }, zoom: 8, cities: [
    { name: "کرمان", lat: 30.2839, lng: 57.0834, zoom: 12 },
    { name: "رفسنجان", lat: 30.4067, lng: 55.9939, zoom: 13 },
    { name: "سیرجان", lat: 29.4519, lng: 55.6814, zoom: 13 },
  ]},
  { name: "سیستان و بلوچستان", center: { lat: 29.4963, lng: 60.8629 }, zoom: 7, cities: [
    { name: "زاهدان", lat: 29.4963, lng: 60.8629, zoom: 12 },
    { name: "زابل", lat: 31.0299, lng: 61.5009, zoom: 13 },
    { name: "ایرانشهر", lat: 27.2025, lng: 60.685, zoom: 13 },
  ]},
  { name: "هرمزگان", center: { lat: 27.1865, lng: 56.2808 }, zoom: 8, cities: [
    { name: "بندرعباس", lat: 27.1865, lng: 56.2808, zoom: 12 },
    { name: "قشم", lat: 26.9581, lng: 56.2719, zoom: 13 },
    { name: "میناب", lat: 27.1276, lng: 57.0801, zoom: 13 },
  ]},
  { name: "بوشهر", center: { lat: 28.9684, lng: 50.8385 }, zoom: 9, cities: [
    { name: "بوشهر", lat: 28.9684, lng: 50.8385, zoom: 12 },
    { name: "گناوه", lat: 29.58, lng: 50.5167, zoom: 13 },
    { name: "برازجان", lat: 29.2667, lng: 51.2167, zoom: 13 },
  ]},
  { name: "خوزستان", center: { lat: 31.3183, lng: 48.6706 }, zoom: 8, cities: [
    { name: "اهواز", lat: 31.3183, lng: 48.6706, zoom: 12 },
    { name: "آبادان", lat: 30.3392, lng: 48.3043, zoom: 13 },
    { name: "دزفول", lat: 32.3814, lng: 48.4019, zoom: 13 },
  ]},
  { name: "کهگیلویه و بویراحمد", center: { lat: 30.6682, lng: 51.588 }, zoom: 9, cities: [
    { name: "یاسوج", lat: 30.6682, lng: 51.588, zoom: 12 },
    { name: "گچساران", lat: 30.3392, lng: 50.7975, zoom: 13 },
  ]},
  { name: "چهارمحال و بختیاری", center: { lat: 32.3258, lng: 50.8645 }, zoom: 9, cities: [
    { name: "شهرکرد", lat: 32.3258, lng: 50.8645, zoom: 12 },
    { name: "بروجن", lat: 31.9667, lng: 51.3, zoom: 13 },
  ]},
  { name: "لرستان", center: { lat: 33.4878, lng: 48.3558 }, zoom: 9, cities: [
    { name: "خرم‌آباد", lat: 33.4878, lng: 48.3558, zoom: 12 },
    { name: "بروجرد", lat: 33.8975, lng: 48.7517, zoom: 13 },
  ]},
  { name: "ایلام", center: { lat: 33.6374, lng: 46.4227 }, zoom: 9, cities: [
    { name: "ایلام", lat: 33.6374, lng: 46.4227, zoom: 12 },
    { name: "دهلران", lat: 32.6941, lng: 47.2667, zoom: 13 },
  ]},
  { name: "کرمانشاه", center: { lat: 34.3142, lng: 47.065 }, zoom: 9, cities: [
    { name: "کرمانشاه", lat: 34.3142, lng: 47.065, zoom: 12 },
    { name: "اسلام‌آبادغرب", lat: 34.1167, lng: 46.5333, zoom: 13 },
  ]},
  { name: "کردستان", center: { lat: 35.3219, lng: 46.9862 }, zoom: 9, cities: [
    { name: "سنندج", lat: 35.3219, lng: 46.9862, zoom: 12 },
    { name: "مریوان", lat: 35.5219, lng: 46.1747, zoom: 13 },
  ]},
  { name: "همدان", center: { lat: 34.7992, lng: 48.5146 }, zoom: 9, cities: [
    { name: "همدان", lat: 34.7992, lng: 48.5146, zoom: 12 },
    { name: "ملایر", lat: 34.2967, lng: 48.8175, zoom: 13 },
  ]},
  { name: "زنجان", center: { lat: 36.6736, lng: 48.4787 }, zoom: 9, cities: [
    { name: "زنجان", lat: 36.6736, lng: 48.4787, zoom: 12 },
    { name: "ابهر", lat: 36.1467, lng: 49.2167, zoom: 13 },
  ]},
  { name: "آذربایجان شرقی", center: { lat: 38.0962, lng: 46.2738 }, zoom: 8, cities: [
    { name: "تبریز", lat: 38.0962, lng: 46.2738, zoom: 11 },
    { name: "مرند", lat: 38.4322, lng: 45.7717, zoom: 13 },
  ]},
  { name: "آذربایجان غربی", center: { lat: 37.5527, lng: 45.0761 }, zoom: 8, cities: [
    { name: "ارومیه", lat: 37.5527, lng: 45.0761, zoom: 12 },
    { name: "خوی", lat: 38.5503, lng: 44.9519, zoom: 13 },
  ]},
  { name: "اردبیل", center: { lat: 38.2498, lng: 48.2933 }, zoom: 9, cities: [
    { name: "اردبیل", lat: 38.2498, lng: 48.2933, zoom: 12 },
    { name: "مشگین‌شهر", lat: 38.3917, lng: 47.6772, zoom: 13 },
  ]},
  { name: "گیلان", center: { lat: 37.2808, lng: 49.5832 }, zoom: 9, cities: [
    { name: "رشت", lat: 37.2808, lng: 49.5832, zoom: 12 },
    { name: "بندرانزلی", lat: 37.4711, lng: 49.4608, zoom: 13 },
    { name: "لاهیجان", lat: 37.2069, lng: 50.0061, zoom: 13 },
  ]},
  { name: "مازندران", center: { lat: 36.5633, lng: 53.0601 }, zoom: 8, cities: [
    { name: "ساری", lat: 36.5633, lng: 53.0601, zoom: 12 },
    { name: "بابل", lat: 36.5513, lng: 52.6791, zoom: 13 },
    { name: "آمل", lat: 36.4711, lng: 52.3511, zoom: 13 },
  ]},
  { name: "گلستان", center: { lat: 36.8392, lng: 54.4392 }, zoom: 9, cities: [
    { name: "گرگان", lat: 36.8392, lng: 54.4392, zoom: 12 },
    { name: "گنبدکاووس", lat: 37.2542, lng: 55.1722, zoom: 13 },
  ]},
  { name: "خراسان شمالی", center: { lat: 37.4747, lng: 57.329 }, zoom: 9, cities: [
    { name: "بجنورد", lat: 37.4747, lng: 57.329, zoom: 12 },
    { name: "شیروان", lat: 37.4081, lng: 57.9183, zoom: 13 },
  ]},
  { name: "خراسان رضوی", center: { lat: 36.2972, lng: 59.6067 }, zoom: 8, cities: [
    { name: "مشهد", lat: 36.2972, lng: 59.6067, zoom: 11 },
    { name: "نیشابور", lat: 36.2133, lng: 58.7975, zoom: 13 },
    { name: "سبزوار", lat: 36.2127, lng: 57.6822, zoom: 13 },
  ]},
  { name: "خراسان جنوبی", center: { lat: 32.8649, lng: 59.2262 }, zoom: 8, cities: [
    { name: "بیرجند", lat: 32.8649, lng: 59.2262, zoom: 12 },
    { name: "قائنات", lat: 33.7256, lng: 59.1819, zoom: 13 },
  ]},
  { name: "سمنان", center: { lat: 35.5729, lng: 53.3971 }, zoom: 8, cities: [
    { name: "سمنان", lat: 35.5729, lng: 53.3971, zoom: 12 },
    { name: "شاهرود", lat: 36.4178, lng: 54.9756, zoom: 13 },
    { name: "دامغان", lat: 36.1683, lng: 54.3492, zoom: 13 },
  ]},
];

export function getProvince(name: string): ProvinceLocation | undefined {
  return provinces.find((p) => p.name === name);
}

export function getCity(provinceName: string, cityName: string): CityLocation | undefined {
  return getProvince(provinceName)?.cities.find((c) => c.name === cityName);
}

// Finds which province a given city name belongs to, regardless of which
// province is currently selected in the UI — handy for syncing state when
// only a city (e.g. a billboard's `city` field) is known.
export function findProvinceOfCity(cityName: string): ProvinceLocation | undefined {
  return provinces.find((p) => p.cities.some((c) => c.name === cityName));
}

// Returns approximate [lat, lng] for any known city name, regardless of
// province. Used as a fallback so every scraped billboard gets a map pin
// even when the source page didn't expose precise GPS coordinates.
export function coordsForCity(cityName: string): { lat: number; lng: number } | null {
  for (const province of provinces) {
    const city = province.cities.find((c) => c.name === cityName);
    if (city) return { lat: city.lat, lng: city.lng };
  }
  return null;
}
