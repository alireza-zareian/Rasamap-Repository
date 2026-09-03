"use client";
import { useState, useRef } from "react";
import Link from "next/link";
import { ImagePlus, X, Check, Lightbulb, CircleCheckBig, ArrowRight, ArrowLeft, ChevronLeft } from "lucide-react";
import Topbar from "@/components/Topbar";
import Footer from "@/components/Footer";

const steps = ["اطلاعات اصلی","موقعیت و نوع","قیمت‌گذاری","تصاویر","انتخاب پلن","تأیید"];
const SUBMIT_STEP = 4;   // the plan step is the last one with a submit button
const DONE_STEP   = 5;

const MAX_PHOTOS = 5;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const ACCEPTED = ["image/jpeg", "image/png", "image/webp"];

// The server independently re-checks every one of these (size, real file type
// via magic bytes, count) — the browser-side copy only exists so a mistake is
// caught before a multi-megabyte upload is attempted.
const PLANS = [
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
] as const;

/** Read a picked file as a base64 data URL for the JSON request body. */
function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

export default function ListMediaPage() {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState({name:"",type:"billboard",city:"تهران",region:"",location:"",width:"",height:"",faces:"2",price:"",phone:"",desc:""});
  const [plan, setPlan] = useState<"free" | "featured">("free");
  const [photos, setPhotos] = useState<{ file: File; preview: string }[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const s=(k:string,v:string)=>setForm(f=>({...f,[k]:v}));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    const remaining = MAX_PHOTOS - photos.length;
    const picked: { file: File; preview: string }[] = [];
    let rejected = "";

    for (const file of files.slice(0, remaining)) {
      if (!ACCEPTED.includes(file.type)) { rejected = "فقط فرمت JPG، PNG یا WEBP پذیرفته می‌شود."; continue; }
      if (file.size > MAX_PHOTO_BYTES)   { rejected = "حجم هر تصویر باید کمتر از ۲ مگابایت باشد."; continue; }
      picked.push({ file, preview: URL.createObjectURL(file) });
    }

    setError(rejected);
    setPhotos(prev => [...prev, ...picked]);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function removePhoto(idx: number) {
    setPhotos(prev => {
      URL.revokeObjectURL(prev[idx].preview);
      return prev.filter((_, i) => i !== idx);
    });
  }

  async function handleSubmit() {
    if (submitting) return;                 // ignore a double-tap mid-request
    setError("");
    setSubmitting(true);
    try {
      const images = await Promise.all(photos.map(p => toDataUrl(p.file)));
      const res = await fetch("/api/listings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          desc: form.desc,
          phone: form.phone,
          type: form.type,
          city: form.city,
          region: form.region,
          location: form.location,
          width: form.width ? parseInt(form.width) : 1,
          height: form.height ? parseInt(form.height) : 1,
          faces: parseInt(form.faces),
          price: form.price ? parseInt(form.price) : 1,
          plan,
          images,
        }),
      });
      if (res.status === 401) {
        window.location.href = `/login?next=${encodeURIComponent("/list-media")}`;
        return;
      }
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? "خطا در ثبت رسانه");
        return;
      }
      setStep(DONE_STEP);
    } catch {
      setError("خطا در اتصال به سرور. لطفاً دوباره امتحان کنید.");
    } finally {
      setSubmitting(false);
    }
  }

  // Required-field check for the current step — blocks "بعدی" until it passes,
  // so the user never reaches the final submit with empty fields and a cryptic
  // server error.
  function validateStep(current: number): string | null {
    if (current === 0) {
      if (form.name.trim().length < 2) return "نام رسانه را وارد کنید (حداقل ۲ حرف).";
      if (!/^09\d{9}$/.test(form.phone.trim())) return "شماره تماس معتبر وارد کنید (۰۹xxxxxxxxx).";
    }
    if (current === 1) {
      if (form.region.trim().length < 1) return "منطقه / محله را وارد کنید.";
      if (form.location.trim().length < 3) return "آدرس دقیق را وارد کنید (حداقل ۳ حرف).";
    }
    if (current === 2) {
      if (!form.width || parseInt(form.width) < 1) return "عرض رسانه را وارد کنید.";
      if (!form.height || parseInt(form.height) < 1) return "ارتفاع رسانه را وارد کنید.";
      if (!form.price || parseInt(form.price) < 1) return "قیمت پایه ماهانه را وارد کنید.";
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) { setError(err); return; }
    setError("");
    setStep(s => s + 1);
  }

  const inp=(label:string,key:keyof typeof form,ph:string,type="text")=>(
    <div style={{marginBottom:14}}>
      <label style={{fontSize:"0.78rem",color:"var(--text-muted)",display:"block",marginBottom:5}}>{label}</label>
      <input value={form[key]} onChange={e=>s(key,e.target.value)} type={type} placeholder={ph}
        style={{width:"100%",background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-main)",fontFamily:"inherit",fontSize:"0.88rem",padding:"10px 14px",borderRadius:9,outline:"none"}}/>
    </div>
  );
  const sel=(label:string,key:keyof typeof form,opts:string[])=>(
    <div style={{marginBottom:14}}>
      <label style={{fontSize:"0.78rem",color:"var(--text-muted)",display:"block",marginBottom:5}}>{label}</label>
      <select value={form[key]} onChange={e=>s(key,e.target.value)}
        style={{width:"100%",background:"var(--bg-surface)",border:"1px solid var(--border)",color:"var(--text-main)",fontFamily:"inherit",fontSize:"0.88rem",padding:"10px 14px",borderRadius:9,outline:"none"}}>
        {opts.map(o=><option key={o}>{o}</option>)}
      </select>
    </div>
  );

  const stepContent = [
    <div key={0}>
      {inp("نام رسانه","name","مثال: بیلبورد اتوبان همت")}
      {inp("توضیحات","desc","درباره موقعیت و ویژگی‌های رسانه بنویسید...")}
      {inp("شماره تماس","phone","09xxxxxxxxx")}
    </div>,
    <div key={1}>
      {sel("نوع رسانه","type",["billboard","digital","bridge","station"])}
      {sel("شهر","city",["تهران","اصفهان","زنجان","مشهد","شیراز","تبریز","اهواز"])}
      {inp("منطقه / محله","region","مثال: منطقه ۳")}
      {inp("آدرس دقیق","location","مثال: خیابان ولیعصر، نبش میرداماد")}
    </div>,
    <div key={2}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {inp("عرض (متر)","width","مثال: 12")}
        {inp("ارتفاع (متر)","height","مثال: 4")}
      </div>
      {sel("تعداد وجوه","faces",["1","2","4","6"])}
      {inp("قیمت پایه ماهانه (میلیون تومان)","price","مثال: 85","number")}
      {form.price && <div style={{background:"rgba(255,179,0,0.08)",border:"1px solid rgba(255,179,0,0.3)",borderRadius:8,padding:"10px 14px",fontSize:"0.8rem",color:"var(--accent-warm)",display:"flex",alignItems:"center",gap:7}}>
        <Lightbulb size={14} style={{flexShrink:0}} /> قیمت هفتگی: ~{Math.round(+form.price/4)}M · سه‌ماهه (۱۰٪ تخفیف): ~{Math.round(+form.price*3*0.9)}M
      </div>}
    </div>,
    <div key={3}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      {photos.length < MAX_PHOTOS && (
        <div
          onClick={() => fileInputRef.current?.click()}
          style={{border:"2px dashed var(--border)",borderRadius:12,padding:"32px",textAlign:"center",color:"var(--text-muted)",marginBottom:14,cursor:"pointer"}}
        >
          <ImagePlus size={32} style={{margin:"0 auto 10px",display:"block",color:"var(--accent)"}} />
          <div style={{fontSize:"0.85rem",marginBottom:4}}>برای انتخاب تصویر کلیک کنید</div>
          <div style={{fontSize:"0.72rem"}}>(حداکثر ۵ تصویر، هر کدام تا ۲ مگابایت — JPG / PNG / WEBP)</div>
        </div>
      )}
      {photos.length > 0 && (
        <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:8,marginBottom:14}}>
          {photos.map((p, i) => (
            <div key={i} style={{position:"relative",borderRadius:8,overflow:"hidden",aspectRatio:"4/3"}}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.preview} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}} />
              <button
                onClick={() => removePhoto(i)}
                style={{position:"absolute",top:4,left:4,background:"rgba(0,0,0,0.6)",border:"none",color:"#fff",borderRadius:"50%",width:22,height:22,display:"flex",alignItems:"center",justifyContent:"center",cursor:"pointer",padding:0}}
              >
                <X size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      <div style={{background:"rgba(34,197,94,0.06)",border:"1px solid rgba(34,197,94,0.2)",borderRadius:8,padding:"10px 14px",fontSize:"0.78rem",color:"var(--green)",display:"flex",alignItems:"flex-start",gap:7}}>
        <Check size={14} style={{flexShrink:0,marginTop:2}} /> تصاویر پس از بررسی و تأیید کارشناس رسامپ همراه با آگهی منتشر می‌شوند. حداکثر ۵ تصویر، هر کدام تا ۲ مگابایت.
      </div>
    </div>,
    <div key={4}>
      <div style={{fontSize:"0.82rem",color:"var(--text-muted)",lineHeight:1.9,marginBottom:14}}>
        درآمد رسامپ از ثبت آگهی است، نه از اجاره‌کننده. اجاره و قرارداد مستقیماً بین شما و آگهی‌دهنده انجام می‌شود.
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10,marginBottom:14}}>
        {PLANS.map(p => {
          const active = plan === p.key;
          return (
            <label key={p.key} style={{display:"block",padding:"14px 16px",background:active?"rgba(59,123,245,0.08)":"var(--bg-surface)",border:`1.5px solid ${active?"var(--accent)":"var(--border)"}`,borderRadius:10,cursor:"pointer"}}>
              <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                <input type="radio" checked={active} onChange={()=>setPlan(p.key)} style={{accentColor:"var(--accent)"}} />
                <span style={{fontSize:"0.92rem",fontWeight:700,flex:1}}>پلن {p.title}</span>
                <span style={{fontSize:"0.82rem",fontWeight:700,color:active?"var(--accent)":"var(--text-muted)"}}>{p.price}</span>
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:4,paddingInlineStart:26}}>
                {p.perks.map(perk => (
                  <div key={perk} style={{fontSize:"0.75rem",color:"var(--text-muted)",display:"flex",alignItems:"center",gap:6}}>
                    <Check size={12} style={{color:"var(--green)",flexShrink:0}} /> {perk}
                  </div>
                ))}
              </div>
            </label>
          );
        })}
      </div>
      {plan === "featured" && (
        <div style={{background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.3)",borderRadius:8,padding:"12px 14px",fontSize:"0.78rem",color:"var(--accent-warm)",lineHeight:1.9,display:"flex",alignItems:"flex-start",gap:7}}>
          <Lightbulb size={14} style={{flexShrink:0,marginTop:3}} />
          <span>
            پرداخت آنلاین فعال نیست. پس از ثبت، آگهی شما در وضعیت «در انتظار پرداخت» قرار می‌گیرد و
            شمارهٔ کارت از طریق پشتیبانی به شما اعلام می‌شود. با تأیید واریز توسط ادمین، آگهی منتشر
            شده و نشان «ویژه» می‌گیرد.
          </span>
        </div>
      )}
    </div>,
    <div key={5} style={{textAlign:"center",padding:"20px 0"}}>
      <div style={{display:"flex",justifyContent:"center",marginBottom:16,color:"var(--green)"}}><CircleCheckBig size={52} strokeWidth={1.5} /></div>
      <div style={{fontSize:"1.1rem",fontWeight:700,marginBottom:8}}>رسانه شما با موفقیت ثبت شد!</div>
      <div style={{fontSize:"0.82rem",color:"var(--text-muted)",marginBottom:24,lineHeight:1.8}}>
        {plan === "featured"
          ? <>آگهی شما ثبت شد و در وضعیت «در انتظار پرداخت» است.<br/>برای هماهنگی واریز، پشتیبانی با شما تماس می‌گیرد.</>
          : <>تیم رسامپ درخواست شما را بررسی می‌کند.<br/>پس از تأیید، رسانه‌ی شما در سایت نمایش داده می‌شود.</>}
        <br/>وضعیت آگهی را می‌توانید در داشبورد دنبال کنید.
      </div>
      <Link href="/dashboard" style={{display:"inline-block",background:"var(--accent)",color:"#fff",padding:"11px 28px",borderRadius:9,textDecoration:"none",fontWeight:700,fontSize:"0.88rem"}}>رفتن به داشبورد</Link>
    </div>,
  ];

  return (
    <div style={{minHeight:"100vh",background:"var(--bg-deep)",fontFamily:"Vazirmatn Variable, Vazirmatn, sans-serif",direction:"rtl",color:"var(--text-main)"}}>
      <Topbar />
      <div style={{maxWidth:560,margin:"0 auto",padding:"86px 20px 40px"}}>
        <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:28}}>
          <Link href="/" style={{color:"var(--text-muted)",textDecoration:"none",fontSize:"0.85rem",display:"inline-flex",alignItems:"center",gap:4}}><ArrowRight size={13} /> رسامپ</Link>
          <span style={{color:"var(--border)",display:"inline-flex"}}><ChevronLeft size={13} /></span>
          <span style={{fontSize:"0.85rem",fontWeight:600}}>ثبت رسانه</span>
        </div>

        {/* Steps */}
        <div style={{display:"flex",gap:4,marginBottom:28}}>
          {steps.map((l,i)=>(
            <div key={l} style={{flex:1,textAlign:"center"}}>
              <div style={{width:28,height:28,borderRadius:"50%",margin:"0 auto 4px",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.72rem",fontWeight:700,background:step>i?"var(--green)":step===i?"var(--accent)":"var(--bg-surface)",color:step>=i?"#fff":"var(--text-muted)",border:`1px solid ${step>=i?"transparent":"var(--border)"}`}}>
                {step>i?<Check size={14} />:i+1}
              </div>
              <div style={{fontSize:"0.6rem",color:step===i?"var(--accent)":"var(--text-muted)"}}>{l}</div>
            </div>
          ))}
        </div>

        <div className="gradient-frame" style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:14,overflow:"hidden"}}>
          <div style={{padding:"20px 22px 16px",borderBottom:"1px solid var(--border)"}}>
            <div style={{fontSize:"1rem",fontWeight:700}}>{steps[step]}</div>
          </div>
          <div style={{padding:"18px 22px"}}>
            {stepContent[step]}
          </div>
          {step < DONE_STEP && (
            <div style={{padding:"14px 22px",borderTop:"1px solid var(--border)"}}>
              {error && (
                <div style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.3)",borderRadius:8,padding:"9px 14px",fontSize:"0.8rem",color:"#ef4444",marginBottom:10}}>
                  {error}
                </div>
              )}
              <div style={{display:"flex",gap:8}}>
                {step>0 && <button onClick={()=>{setError("");setStep(s=>s-1);}} style={{border:"1px solid var(--border)",background:"none",color:"var(--text-main)",fontFamily:"inherit",fontSize:"0.82rem",padding:"9px 18px",borderRadius:8,cursor:"pointer",flex:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5}}><ArrowRight size={14} /> قبلی</button>}
                <button
                  onClick={step===SUBMIT_STEP ? handleSubmit : goNext}
                  disabled={submitting}
                  className="btn-sheen"
                  style={{background:submitting?"var(--border)":"var(--accent)",border:"none",color:"#fff",fontFamily:"inherit",fontSize:"0.85rem",fontWeight:700,padding:"9px 24px",borderRadius:8,cursor:submitting?"not-allowed":"pointer",flex:2,opacity:submitting?0.7:1,display:"inline-flex",alignItems:"center",justifyContent:"center",gap:6}}>
                  {submitting ? "در حال ارسال..." : step===SUBMIT_STEP ? <><Check size={15} /> ثبت نهایی</> : <>بعدی <ArrowLeft size={14} /></>}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
