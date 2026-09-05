"use client";
import Link from "next/link";
import { Billboard, typeLabels } from "@/lib/types";
import { TypeIcon } from "@/components/TypeIcon";
import { Scale, X, Star } from "lucide-react";
import { faNum } from "@/lib/format";

interface Props {
  items: Billboard[];
  onClose: () => void;
}

export default function CompareModal({ items, onClose }: Props) {
  if (items.length < 2) return null;
  const [a, b] = items;

  const rows: [string, (b:Billboard)=>string|number, boolean][] = [
    ["نوع رسانه", b=>typeLabels[b.type], false],
    ["منطقه", b=>b.region, false],
    ["ابعاد", b=>`${b.width}×${b.height} م`, false],
    ["مساحت (م²)", b=>b.width*b.height, true],
    ["تعداد وجوه", b=>b.faces, true],
    ["بازدید روزانه (تخمین)", b=>faNum(b.traffic.estimatedViews), true],
    ["امتیاز دیده‌شدن", b=>b.traffic.viewabilityScore+"/100", true],
    ["ترافیک سواره (روز)", b=>faNum(b.traffic.daily), true],
    ["ترافیک پیاده (روز)", b=>faNum(b.traffic.pedestrian), true],
    ["قیمت ماهانه (M ت)", b=>b.price, false],
    ["قیمت سالانه (M ت)", b=>b.priceYearly, false],
    ["سن سازه (سال)", b=>b.age, false],
    ["امتیاز کاربران", b=>b.reviewCount>0 ? b.rating+` (${b.reviewCount} نظر)` : "بدون نظر", true],
    ["وضعیت", b=>b.status==="available"?"خالی":"مشغول", false],
  ];

  const better = (row: typeof rows[0], val: Billboard) => {
    if (!row[2]) return false;
    const fn = row[1];
    const aVal = typeof fn(a)==="string" ? parseFloat(fn(a) as string) : fn(a) as number;
    const bVal = typeof fn(b)==="string" ? parseFloat(fn(b) as string) : fn(b) as number;
    const thisVal = typeof fn(val)==="string" ? parseFloat(fn(val) as string) : fn(val) as number;
    // For price: lower is better
    if (row[0].includes("قیمت")) return thisVal < (val===a?bVal:aVal);
    return thisVal > (val===a?bVal:aVal);
  };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:500,background:"rgba(6,10,18,0.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,0.8)",animation:"fadeIn 0.25s ease"}}>

        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:"1.05rem",fontWeight:700,display:"flex",alignItems:"center",gap:7}}><Scale size={18} /> مقایسه رسانه‌ها</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",display:"flex"}}><X size={18} /></button>
        </div>

        {/* Header row */}
        <div className="cmp-grid" style={{display:"grid",gridTemplateColumns:"minmax(84px,150px) 1fr 1fr",overflowX:"hidden",gap:0,padding:"14px 22px",borderBottom:"1px solid var(--border)"}}>
          <div/>
          {[a,b].map(board=>(
            <div key={board.id} style={{textAlign:"center",padding:"0 8px"}}>
              <div style={{marginBottom:4,display:"flex",justifyContent:"center",color:"var(--text-muted)"}}><TypeIcon type={board.type} size={30} /></div>
              <div style={{fontSize:"0.8rem",fontWeight:700,lineHeight:1.4}}>{board.name.substring(0,30)}...</div>
              <div style={{fontSize:"0.7rem",color:"var(--text-muted)",marginTop:2}}>{board.region}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        <div style={{padding:"8px 22px"}}>
          {rows.map(row=>(
            <div key={row[0]} className="cmp-grid" style={{display:"grid",gridTemplateColumns:"minmax(84px,150px) 1fr 1fr",overflowX:"hidden",borderBottom:"1px solid var(--border)",padding:"8px 0",alignItems:"center"}}>
              <div style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>{row[0]}</div>
              {[a,b].map(board=>{
                const isBetter = row[2] && better(row, board);
                return (
                  <div key={board.id} style={{textAlign:"center",fontSize:"0.85rem",fontWeight:isBetter?700:400,color:isBetter?"var(--green)":"var(--text-main)",background:isBetter?"rgba(34,197,94,0.06)":"transparent",borderRadius:6,padding:"4px 8px",display:"flex",alignItems:"center",justifyContent:"center",gap:4}}>
                    {isBetter && <Star size={11} fill="currentColor" />}{row[1](board)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{fontSize:"0.68rem",color:"var(--text-muted)",padding:"8px 22px",textAlign:"center",display:"flex",alignItems:"center",justifyContent:"center",gap:5}}>
          <Star size={11} fill="currentColor" /> سبز = بهتر در این معیار
        </div>

        {/* Footer — the next step is the media's own detail page, where the
            owner's phone number is; Rasamap does not sell the space itself. */}
        <div className="cmp-grid" style={{display:"grid",gridTemplateColumns:"minmax(84px,150px) 1fr 1fr",overflowX:"hidden",gap:8,padding:"14px 22px",borderTop:"1px solid var(--border)"}}>
          <div/>
          {[a,b].map(board=>(
            <Link key={board.id} href={`/billboard/${board.slug}`} onClick={onClose} style={{background:"var(--accent)",color:"#fff",fontFamily:"inherit",fontSize:"0.8rem",fontWeight:700,padding:"9px 0",borderRadius:8,textDecoration:"none",textAlign:"center"}}>
              مشاهده و تماس
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
