// ============================================================
// RASAMAP — Core Data Types & Billboard Database
// ============================================================

export type BillboardType = "billboard" | "digital" | "bridge" | "station" | "vehicle";
export type BillboardStatus = "available" | "busy" | "reserved" | "inactive";
export type SortOption = "price_asc" | "price_desc" | "traffic_desc" | "area_desc";

export interface TrafficData {
  daily: number;          // vehicles/day
  peakHour: string;
  congestionLevel: number; // 1-10
  pedestrian: number;     // walkers/day
  estimatedViews: number; // unique ad exposures/day
  viewabilityScore: number; // 0-100
}

export interface Billboard {
  id: number;
  name: string;
  slug: string;
  location: string;
  region: string;
  city: string;
  type: BillboardType;
  status: BillboardStatus;
  width: number;
  height: number;
  faces: number;
  age: number;
  price: number;         // million toman/month
  priceWeekly: number;
  priceQuarterly: number;
  priceYearly: number;
  traffic: TrafficData;
  mapX: number;          // % position on map
  mapY: number;
  lat?: number;          // real coordinates — present for scraped listings that have them
  lng?: number;
  icon: string;
  images: string[];
  allImages?: string[];  // all images across all faces — populated by DetailModal from images[]
  agency: string;
  phone: string;
  description: string;
  features: string[];
  nearbyLandmarks: string[];
  rating: number;
  reviewCount: number;
  // Scraper-specific fields (optional — not present on static records)
  url?: string;
  source?: string;
  structureCode?: string;
  scrapedAt?: string;
}

// Traffic calculation helper
function calcTraffic(dailyVehicles: number, congestion: number, pedestrian: number): TrafficData {
  const peakHours = ["۸-۹ صبح", "۵-۶ عصر", "۱۲-۱ ظهر"];
  const peakHour = peakHours[Math.floor(congestion / 4)];
  // Viewability: each vehicle ~ 1.4 occupants, 40% notice rate + pedestrians 60% notice
  const estimatedViews = Math.round(dailyVehicles * 1.4 * 0.4 + pedestrian * 0.6);
  const viewabilityScore = Math.min(100, Math.round(30 + congestion * 5 + (pedestrian > 10000 ? 15 : 0)));
  return { daily: dailyVehicles, peakHour, congestionLevel: congestion, pedestrian, estimatedViews, viewabilityScore };
}

export const billboards: Billboard[] = [
  {
    id: 1,
    name: "بیلبورد اتوبان همت غرب — تقاطع شیخ فضل‌الله",
    slug: "billboard-hemmat-west",
    location: "اتوبان همت، قبل از تقاطع شیخ فضل‌الله، سمت غرب",
    region: "منطقه ۵",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 14, height: 4, faces: 2, age: 8,
    price: 180, priceWeekly: 55, priceQuarterly: 486, priceYearly: 1728,
    traffic: calcTraffic(420000, 9, 8000),
    mapX: 18, mapY: 45,
    icon: "🏙️",
    images: [],
    agency: "آژانس پیشتاز رسانه",
    phone: "021-44112233",
    description: "یکی از پربازدیدترین بیلبوردهای تهران روی اتوبان همت با دید ۲ طرفه برای رانندگان شرق و غرب.",
    features: ["نورپردازی شبانه", "دو وجهه", "اسکلت فلزی استاندارد", "ارتفاع ۱۲ متر از زمین"],
    nearbyLandmarks: ["پل شیخ فضل‌الله", "بیمارستان ایران", "مرکز خرید کوروش"],
    rating: 4.8, reviewCount: 24,
  },
  {
    id: 2,
    name: "تلویزیون شهری میدان ونک",
    slug: "digital-vanak",
    location: "میدان ونک، ضلع شمالی، مقابل برج ونک",
    region: "منطقه ۳",
    city: "تهران",
    type: "digital",
    status: "available",
    width: 8, height: 5, faces: 1, age: 2,
    price: 320, priceWeekly: 95, priceQuarterly: 864, priceYearly: 3072,
    traffic: calcTraffic(680000, 10, 45000),
    mapX: 55, mapY: 30,
    icon: "📺",
    images: [],
    agency: "دیجیتال آوا",
    phone: "021-88776655",
    description: "تلویزیون شهری full HD در قلب تهران با ترافیک عابر پیاده و سواره بسیار بالا. امکان پخش ویدیو و تبلیغات پویا.",
    features: ["Full HD 4K", "پخش ویدیو", "اتوماسیون زمانبندی", "ضداب و ضدگرد"],
    nearbyLandmarks: ["برج ونک", "میدان ونک", "پارک ملت", "مجتمع تجاری پالادیوم"],
    rating: 4.9, reviewCount: 41,
  },
  {
    id: 3,
    name: "عرشه پل صدر — تقاطع مدرس",
    slug: "bridge-sadr-modarres",
    location: "تقاطع بزرگراه صدر و بزرگراه مدرس، عرشه جنوبی",
    region: "منطقه ۳",
    city: "تهران",
    type: "bridge",
    status: "busy",
    width: 20, height: 6, faces: 2, age: 5,
    price: 420, priceWeekly: 125, priceQuarterly: 1134, priceYearly: 4032,
    traffic: calcTraffic(820000, 10, 5000),
    mapX: 65, mapY: 28,
    icon: "🌉",
    images: [],
    agency: "رسانه پل",
    phone: "021-22334455",
    description: "بزرگ‌ترین عرشه پل تبلیغاتی تهران در پرترافیک‌ترین نقطه بزرگراهی شهر.",
    features: ["بزرگ‌ترین سطح تبلیغاتی", "دید از دو بزرگراه", "نورپردازی ۲۴ ساعته", "ضدلرزه"],
    nearbyLandmarks: ["پل صدر", "بزرگراه مدرس", "پارک چیتگر"],
    rating: 4.7, reviewCount: 18,
  },
  {
    id: 4,
    name: "بیلبورد بزرگراه شیخ فضل‌الله",
    slug: "billboard-sheikh",
    location: "بزرگراه شیخ فضل‌الله، کیلومتر ۳، سمت جنوب",
    region: "منطقه ۲",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 12, height: 4, faces: 2, age: 12,
    price: 95, priceWeekly: 29, priceQuarterly: 256, priceYearly: 912,
    traffic: calcTraffic(280000, 7, 3000),
    mapX: 22, mapY: 55,
    icon: "🏗️",
    images: [],
    agency: "آژانس سپهر",
    phone: "021-66223344",
    description: "بیلبورد دو وجهه با قیمت مناسب برای کسب‌وکارهای کوچک و متوسط در مسیر غرب تهران.",
    features: ["دو وجهه", "نورپردازی شبانه", "دسترسی آسان برای اجرا"],
    nearbyLandmarks: ["برج میلاد (۲ کیلومتر)", "پارک جنگلی چیتگر"],
    rating: 4.2, reviewCount: 9,
  },
  {
    id: 5,
    name: "استرابورد ایستگاه تجریش",
    slug: "station-tajrish",
    location: "میدان تجریش، جنب ایستگاه مترو، خروجی شماره ۲",
    region: "منطقه ۱",
    city: "تهران",
    type: "station",
    status: "available",
    width: 5, height: 2.5, faces: 4, age: 3,
    price: 45, priceWeekly: 14, priceQuarterly: 121, priceYearly: 432,
    traffic: calcTraffic(85000, 8, 62000),
    mapX: 68, mapY: 14,
    icon: "🚇",
    images: [],
    agency: "مترو تبلیغات",
    phone: "021-77889900",
    description: "استرابورد ۴ وجهه در شلوغ‌ترین ایستگاه مترو شمال تهران با ترافیک عابر پیاده فوق‌العاده بالا.",
    features: ["۴ وجهه", "ترافیک پیاده بسیار بالا", "مترو + اتوبوس", "روشنایی داخلی"],
    nearbyLandmarks: ["بازار تجریش", "امامزاده صالح", "مرکز خرید تجریش"],
    rating: 4.6, reviewCount: 31,
  },
  {
    id: 6,
    name: "بیلبورد دیجیتال ولیعصر — میرداماد",
    slug: "digital-valiasr",
    location: "خیابان ولیعصر، تقاطع میرداماد، ضلع غربی",
    region: "منطقه ۳",
    city: "تهران",
    type: "digital",
    status: "available",
    width: 10, height: 6, faces: 1, age: 1,
    price: 285, priceWeekly: 85, priceQuarterly: 769, priceYearly: 2736,
    traffic: calcTraffic(520000, 9, 38000),
    mapX: 48, mapY: 38,
    icon: "💡",
    images: [],
    agency: "دیجیتال آوا",
    phone: "021-88776655",
    description: "نوترین بیلبورد دیجیتال تهران با تکنولوژی LED نسل جدید و قابلیت پخش محتوای لحظه‌ای.",
    features: ["LED نسل جدید", "روشنایی ۱۰۰۰۰ nit", "پخش زنده", "کنترل از راه دور", "آمار بازدید آنلاین"],
    nearbyLandmarks: ["مجتمع تجاری پالادیوم", "بیمارستان آسیا", "تقاطع میرداماد"],
    rating: 5.0, reviewCount: 7,
  },
  {
    id: 7,
    name: "بیلبورد آزادراه تهران-کرج",
    slug: "billboard-tehran-karaj",
    location: "آزادراه تهران-کرج، کیلومتر ۵، سمت تهران",
    region: "منطقه ۵",
    city: "تهران",
    type: "billboard",
    status: "busy",
    width: 16, height: 5, faces: 2, age: 6,
    price: 240, priceWeekly: 72, priceQuarterly: 648, priceYearly: 2304,
    traffic: calcTraffic(610000, 8, 2000),
    mapX: 8, mapY: 50,
    icon: "🛣️",
    images: [],
    agency: "آژانس راه‌نما",
    phone: "026-33445566",
    description: "دروازه ورودی تهران از غرب با ترافیک یکی از شلوغ‌ترین آزادراه‌های کشور.",
    features: ["دید از مسافت ۵۰۰ متر", "ارتفاع ۱۵ متر", "دو طرفه", "نورپردازی قوی"],
    nearbyLandmarks: ["پیچ شمیران کرج", "ورودی آزادراه", "تاسیسات پتروشیمی"],
    rating: 4.5, reviewCount: 16,
  },
  {
    id: 8,
    name: "بیلبورد بزرگراه رسالت — هنگام",
    slug: "billboard-resalat",
    location: "بزرگراه رسالت، بعد از خیابان هنگام، سمت شرق",
    region: "منطقه ۴",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 14, height: 4.5, faces: 2, age: 9,
    price: 130, priceWeekly: 39, priceQuarterly: 351, priceYearly: 1248,
    traffic: calcTraffic(340000, 7, 6000),
    mapX: 78, mapY: 55,
    icon: "🏙️",
    images: [],
    agency: "آژانس شرق تهران",
    phone: "021-77001122",
    description: "بیلبورد دو وجهه در شرق تهران مناسب برای برندهای با مخاطب شرق پایتخت.",
    features: ["دو وجهه", "شرق تهران", "نورپردازی شبانه"],
    nearbyLandmarks: ["مرکز خرید هنگام", "خیابان دماوند"],
    rating: 4.1, reviewCount: 11,
  },
  {
    id: 9,
    name: "تلویزیون شهری پارک ملت",
    slug: "digital-mellat-park",
    location: "خیابان ولیعصر، جنب پارک ملت، درب اصلی",
    region: "منطقه ۳",
    city: "تهران",
    type: "digital",
    status: "busy",
    width: 6, height: 4, faces: 1, age: 3,
    price: 190, priceWeekly: 57, priceQuarterly: 513, priceYearly: 1824,
    traffic: calcTraffic(290000, 7, 28000),
    mapX: 50, mapY: 45,
    icon: "📺",
    images: [],
    agency: "دیجیتال شهر",
    phone: "021-88551122",
    description: "تلویزیون شهری مقابل یکی از پرتردد‌ترین پارک‌های تهران با مخاطب خانوادگی متمول.",
    features: ["محیط خانوادگی", "مخاطب طبقه متوسط به بالا", "پخش ویدیو"],
    nearbyLandmarks: ["پارک ملت", "برج میلاد", "سینما آزادی"],
    rating: 4.4, reviewCount: 22,
  },
  {
    id: 10,
    name: "عرشه پل بزرگراه چمران",
    slug: "bridge-chamran",
    location: "بزرگراه چمران، پل ورودی از اتوبان همت",
    region: "منطقه ۱",
    city: "تهران",
    type: "bridge",
    status: "available",
    width: 18, height: 5, faces: 2, age: 4,
    price: 380, priceWeekly: 114, priceQuarterly: 1026, priceYearly: 3648,
    traffic: calcTraffic(740000, 10, 4000),
    mapX: 62, mapY: 20,
    icon: "🌉",
    images: [],
    agency: "پل تبلیغات ایران",
    phone: "021-22110033",
    description: "عرشه پل در یکی از مهم‌ترین نقاط ترافیکی تهران با دید کامل از بزرگراه چمران و همت.",
    features: ["دید از دو بزرگراه", "بزرگترین سطح شمال تهران", "نورپردازی هوشمند"],
    nearbyLandmarks: ["برج میلاد", "پارک چیتگر", "تقاطع چمران-همت"],
    rating: 4.8, reviewCount: 19,
  },
  {
    id: 11,
    name: "بیلبورد میدان آزادی",
    slug: "billboard-azadi",
    location: "میدان آزادی، بلوار غربی، رو به برج آزادی",
    region: "منطقه ۲",
    city: "تهران",
    type: "billboard",
    status: "available",
    width: 12, height: 4, faces: 2, age: 15,
    price: 160, priceWeekly: 48, priceQuarterly: 432, priceYearly: 1536,
    traffic: calcTraffic(480000, 8, 25000),
    mapX: 18, mapY: 68,
    icon: "🏛️",
    images: [],
    agency: "آژانس آزادی",
    phone: "021-66332211",
    description: "بیلبورد در نمادین‌ترین میدان تهران با ترافیک توریستی و شهری بالا.",
    features: ["موقعیت نمادین", "توریست بین‌المللی", "دو وجهه", "نورپردازی"],
    nearbyLandmarks: ["برج آزادی", "موزه آزادی", "اتوبان آزادگان"],
    rating: 4.6, reviewCount: 35,
  },
  {
    id: 12,
    name: "استرابورد ایستگاه دروازه دولت",
    slug: "station-darvazehdolat",
    location: "خیابان کریم‌خان، ایستگاه مترو دروازه دولت، پیاده‌رو اصلی",
    region: "منطقه ۶",
    city: "تهران",
    type: "station",
    status: "busy",
    width: 4, height: 2, faces: 6, age: 5,
    price: 38, priceWeekly: 12, priceQuarterly: 102, priceYearly: 364,
    traffic: calcTraffic(120000, 8, 55000),
    mapX: 42, mapY: 60,
    icon: "🚇",
    images: [],
    agency: "مترو تبلیغات",
    phone: "021-77889900",
    description: "استرابورد ۶ وجهه با بیشترین تعداد وجه در ایستگاه مرکزی کریم‌خان. مخاطب دانشجو و جوان.",
    features: ["۶ وجهه", "مخاطب جوان", "مرکز شهر", "پرترافیک‌ترین پیاده‌رو"],
    nearbyLandmarks: ["پارک لاله", "دانشگاه تهران (۱۰ دقیقه)", "کریم‌خان زند"],
    rating: 4.3, reviewCount: 14,
  },
];

export const typeLabels: Record<BillboardType, string> = {
  billboard: "بیلبورد",
  digital: "دیجیتال",
  bridge: "عرشه پل",
  station: "ایستگاه",
  vehicle: "وسیله نقلیه",
};

export const typeIcons: Record<BillboardType, string> = {
  billboard: "🏙️",
  digital: "📺",
  bridge: "🌉",
  station: "🚇",
  vehicle: "🚌",
};

export const regionStats = [
  { name: "صدر - همت", occupancy: 92, avgPrice: 300, count: 28 },
  { name: "ولیعصر", occupancy: 87, avgPrice: 250, count: 22 },
  { name: "شریعتی", occupancy: 78, avgPrice: 180, count: 18 },
  { name: "آزادی", occupancy: 71, avgPrice: 155, count: 15 },
  { name: "رسالت", occupancy: 65, avgPrice: 120, count: 20 },
  { name: "چمران", occupancy: 88, avgPrice: 280, count: 12 },
];

export const marketKPIs = {
  totalBoards: 387,
  occupancyRate: 64,
  dailyReach: "۱۲M",
  avgPrice: 85,
  monthlyGrowth: 8.4,
  topCity: "تهران",
};

// ── Extra cities ────────────────────────────────────────────────
export const extraBillboards: Billboard[] = [
  {
    id:20, name:"بیلبورد میدان انقلاب زنجان", slug:"zanjan-enghelab",
    location:"میدان انقلاب، بلوار اصلی، سمت شمال", region:"مرکز شهر", city:"زنجان",
    type:"billboard", status:"available", width:12, height:4, faces:2, age:6,
    price:42, priceWeekly:13, priceQuarterly:113, priceYearly:403,
    traffic:calcTraffic(95000,6,12000), mapX:48, mapY:38,
    icon:"🏙️", images:[], agency:"آژانس زنجان رسانه", phone:"024-33112233",
    description:"بیلبورد مرکزی زنجان در شلوغ‌ترین میدان شهر",
    features:["دو وجهه","نورپردازی شبانه"], nearbyLandmarks:["بازار زنجان","مسجد جامع"],
    rating:4.2, reviewCount:8,
  },
  {
    id:21, name:"تلویزیون شهری بلوار کشاورز زنجان", slug:"zanjan-keshaverz-digital",
    location:"بلوار کشاورز، نبش خیابان امام", region:"شمال شهر", city:"زنجان",
    type:"digital", status:"available", width:6, height:4, faces:1, age:2,
    price:68, priceWeekly:20, priceQuarterly:183, priceYearly:653,
    traffic:calcTraffic(72000,5,9000), mapX:55, mapY:32,
    icon:"📺", images:[], agency:"دیجیتال زنجان", phone:"024-33445566",
    description:"تنها تلویزیون شهری دیجیتال Full HD در زنجان",
    features:["Full HD","پخش ویدیو","کنترل از راه دور"], nearbyLandmarks:["پارک ملت زنجان"],
    rating:4.5, reviewCount:12,
  },
  {
    id:22, name:"بیلبورد ورودی اتوبان زنجان-تهران", slug:"zanjan-highway-entry",
    location:"ورودی اتوبان زنجان-تهران، کیلومتر ۱", region:"ورودی شهر", city:"زنجان",
    type:"billboard", status:"busy", width:14, height:5, faces:2, age:9,
    price:55, priceWeekly:17, priceQuarterly:148, priceYearly:528,
    traffic:calcTraffic(180000,7,1000), mapX:35, mapY:60,
    icon:"🛣️", images:[], agency:"آژانس زنجان رسانه", phone:"024-33112233",
    description:"دروازه ورودی زنجان از اتوبان تهران با بیشترین ترافیک ورودی شهر",
    features:["دید از ۵۰۰ متر","ارتفاع ۱۴ متر"], nearbyLandmarks:["پل ورودی زنجان"],
    rating:4.0, reviewCount:5,
  },
  {
    id:23, name:"بیلبورد خیابان ولیعصر اصفهان", slug:"isfahan-valiasr",
    location:"خیابان ولیعصر، قبل از چهارراه شیخ بهایی", region:"منطقه ۶", city:"اصفهان",
    type:"billboard", status:"available", width:12, height:4, faces:2, age:7,
    price:75, priceWeekly:23, priceQuarterly:202, priceYearly:720,
    traffic:calcTraffic(210000,7,18000), mapX:52, mapY:45,
    icon:"🏙️", images:[], agency:"آژانس اصفهان تبلیغات", phone:"031-33221100",
    description:"بیلبورد پرترافیک خیابان ولیعصر اصفهان",
    features:["دو وجهه","نورپردازی"], nearbyLandmarks:["چهارباغ","سی و سه پل"],
    rating:4.3, reviewCount:14,
  },
  {
    id:24, name:"تلویزیون شهری میدان نقش جهان", slug:"isfahan-naghshjahan-digital",
    location:"میدان نقش جهان، ضلع غربی", region:"مرکز تاریخی", city:"اصفهان",
    type:"digital", status:"available", width:8, height:5, faces:1, age:3,
    price:140, priceWeekly:42, priceQuarterly:378, priceYearly:1344,
    traffic:calcTraffic(320000,8,85000), mapX:60, mapY:52,
    icon:"📺", images:[], agency:"رسانه توریست اصفهان", phone:"031-33445566",
    description:"پرترافیک‌ترین مکان توریستی ایران با مخاطب ملی و بین‌المللی",
    features:["مخاطب توریست","Full HD","دیواری"], nearbyLandmarks:["مسجد امام","کاخ عالی قاپو"],
    rating:4.8, reviewCount:29,
  },
];

export const allBillboards: Billboard[] = [...billboards, ...extraBillboards];

// ── Auto-scraped listings ───────────────────────────────────────
// scraper/data/billboards.json is regenerated nightly by
// .github/workflows/scrape.yml (or manually via `python scraper/scraper.py`).
// It starts as an empty array so the build never breaks before the first run.
import scrapedRaw from "../scraper/data/billboards.json";
export const scrapedBillboards: Billboard[] = scrapedRaw as Billboard[];

export const everyBillboard: Billboard[] = [...allBillboards, ...scrapedBillboards];