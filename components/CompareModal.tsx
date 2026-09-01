"use client";
import { Billboard, typeLabels } from "@/lib/data";

interface Props {
  items: Billboard[];
  onClose: () => void;
  onBook: (b: Billboard) => void;
}

export default function CompareModal({ items, onClose, onBook }: Props) {
  if (items.length < 2) return null;
  const [a, b] = items;

  const rows: [string, (b:Billboard)=>string|number, boolean][] = [
    ["نوع رسانه", b=>typeLabels[b.type], false],
    ["منطقه", b=>b.region, false],
    ["ابعاد", b=>`${b.width}×${b.height} م`, false],
    ["مساحت (م²)", b=>b.width*b.height, true],
    ["تعداد وجوه", b=>b.faces, true],
    ["بازدید روزانه (تخمین)", b=>b.traffic.estimatedViews.toLocaleString(), true],
    ["امتیاز دیده‌شدن", b=>b.traffic.viewabilityScore+"/100", true],
    ["ترافیک سواره (روز)", b=>b.traffic.daily.toLocaleString(), true],
    ["ترافیک پیاده (روز)", b=>b.traffic.pedestrian.toLocaleString(), true],
    ["قیمت ماهانه (M ت)", b=>b.price, false],
    ["قیمت سالانه (M ت)", b=>b.priceYearly, false],
    ["سن سازه (سال)", b=>b.age, false],
    ["امتیاز کاربران", b=>b.rating+` (${b.reviewCount})`, true],
    ["وضعیت", b=>b.status==="available"?"✅ خالی":"🔴 مشغول", false],
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
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:400,background:"rgba(6,10,18,0.9)",backdropFilter:"blur(8px)",display:"flex",alignItems:"center",justifyContent:"center",padding:20}}>
      <div onClick={e=>e.stopPropagation()} style={{background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:16,width:"100%",maxWidth:680,maxHeight:"92vh",overflowY:"auto",boxShadow:"0 32px 80px rgba(0,0,0,0.8)",animation:"fadeIn 0.25s ease"}}>

        <div style={{padding:"18px 22px 14px",borderBottom:"1px solid var(--border)",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div style={{fontSize:"1.05rem",fontWeight:700}}>⚖️ مقایسه رسانه‌ها</div>
          <button onClick={onClose} style={{background:"none",border:"none",color:"var(--text-muted)",fontSize:"1.3rem",cursor:"pointer"}}>✕</button>
        </div>

        {/* Header row */}
        <div style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr",gap:0,padding:"14px 22px",borderBottom:"1px solid var(--border)"}}>
          <div/>
          {[a,b].map(board=>(
            <div key={board.id} style={{textAlign:"center",padding:"0 8px"}}>
              <div style={{fontSize:"2rem",marginBottom:4}}>{board.icon}</div>
              <div style={{fontSize:"0.8rem",fontWeight:700,lineHeight:1.4}}>{board.name.substring(0,30)}...</div>
              <div style={{fontSize:"0.7rem",color:"var(--text-muted)",marginTop:2}}>{board.region}</div>
            </div>
          ))}
        </div>

        {/* Rows */}
        <div style={{padding:"8px 22px"}}>
          {rows.map(row=>(
            <div key={row[0]} style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr",borderBottom:"1px solid var(--border)",padding:"8px 0",alignItems:"center"}}>
              <div style={{fontSize:"0.75rem",color:"var(--text-muted)"}}>{row[0]}</div>
              {[a,b].map(board=>{
                const isBetter = row[2] && better(row, board);
                return (
                  <div key={board.id} style={{textAlign:"center",fontSize:"0.85rem",fontWeight:isBetter?700:400,color:isBetter?"var(--green)":"var(--text-main)",background:isBetter?"rgba(34,197,94,0.06)":"transparent",borderRadius:6,padding:"4px 8px"}}>
                    {isBetter && "★ "}{row[1](board)}
                  </div>
                );
              })}
            </div>
          ))}
        </div>

        <div style={{fontSize:"0.68rem",color:"var(--text-muted)",padding:"8px 22px",textAlign:"center"}}>
          ★ سبز = بهتر در این معیار
        </div>

        {/* Footer */}
        <div style={{display:"grid",gridTemplateColumns:"180px 1fr 1fr",gap:8,padding:"14px 22px",borderTop:"1px solid var(--border)"}}>
          <div/>
          {[a,b].map(board=>(
            <button key={board.id} onClick={()=>{onBook(board);onClose();}} disabled={board.status!=="available"} style={{background:board.status==="available"?"var(--accent)":"var(--border)",border:"none",color:board.status==="available"?"#fff":"var(--text-muted)",fontFamily:"inherit",fontSize:"0.8rem",fontWeight:700,padding:"9px 0",borderRadius:8,cursor:board.status==="available"?"pointer":"not-allowed"}}>
              {board.status==="available"?"رزرو این رسانه":"مشغول است"}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
