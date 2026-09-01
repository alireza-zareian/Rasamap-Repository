"use client";
import { Billboard } from "@/lib/types";

interface Props {
  billboards: Billboard[];
  selectedId: number|null;
  compareIds: number[];
  onSelect: (b:Billboard)=>void;
}

export default function MapView({ billboards, selectedId, compareIds, onSelect }: Props) {
  const available = billboards.filter(b=>b.status==="available").length;
  const busy = billboards.filter(b=>b.status==="busy").length;

  return (
    <div style={{flex:1,position:"relative",background:"#060A12",overflow:"hidden"}}>
      {/* Grid */}
      <div style={{position:"absolute",inset:0,backgroundImage:"linear-gradient(rgba(42,51,71,0.35) 1px,transparent 1px),linear-gradient(90deg,rgba(42,51,71,0.35) 1px,transparent 1px)",backgroundSize:"60px 60px"}}/>

      {/* Roads SVG */}
      <svg style={{position:"absolute",inset:0,width:"100%",height:"100%",pointerEvents:"none"}} viewBox="0 0 1000 700" preserveAspectRatio="xMidYMid slice">
        {/* Beltways */}
        <ellipse cx="500" cy="350" rx="380" ry="260" fill="none" stroke="#162030" strokeWidth="8" opacity="0.5"/>
        {/* Major highways */}
        <line x1="0" y1="210" x2="1000" y2="210" stroke="#1C2A3A" strokeWidth="14"/>
        <line x1="0" y1="420" x2="1000" y2="420" stroke="#1C2A3A" strokeWidth="10"/>
        <line x1="200" y1="0" x2="200" y2="700" stroke="#1C2A3A" strokeWidth="12"/>
        <line x1="600" y1="0" x2="600" y2="700" stroke="#1C2A3A" strokeWidth="10"/>
        <line x1="820" y1="0" x2="820" y2="700" stroke="#162030" strokeWidth="8"/>
        {/* Secondary */}
        <line x1="0" y1="560" x2="1000" y2="560" stroke="#162030" strokeWidth="6" opacity="0.7"/>
        <line x1="400" y1="0" x2="400" y2="700" stroke="#162030" strokeWidth="6" opacity="0.7"/>
        <line x1="700" y1="0" x2="700" y2="700" stroke="#162030" strokeWidth="5" opacity="0.6"/>
        {/* Diagonal */}
        <line x1="0" y1="700" x2="350" y2="0" stroke="#162030" strokeWidth="5" opacity="0.5"/>
        {/* Labels */}
        <text x="500" y="206" fill="#2A3A50" fontSize="11" textAnchor="middle" fontWeight="600">بزرگراه همت</text>
        <text x="500" y="416" fill="#2A3A50" fontSize="11" textAnchor="middle" fontWeight="600">بزرگراه رسالت</text>
        <text x="197" y="80" fill="#2A3A50" fontSize="10" textAnchor="middle" transform="rotate(-90,197,80)">بزرگراه ولیعصر</text>
        <text x="597" y="80" fill="#2A3A50" fontSize="10" textAnchor="middle" transform="rotate(-90,597,80)">بزرگراه شریعتی</text>
        <text x="817" y="80" fill="#2A3A50" fontSize="10" textAnchor="middle" transform="rotate(-90,817,80)">بزرگراه چمران</text>
        {/* Zone labels */}
        <text x="90" y="310" fill="#1A2535" fontSize="32" fontWeight="900" opacity="0.35">۵</text>
        <text x="680" y="120" fill="#1A2535" fontSize="26" fontWeight="900" opacity="0.35">۱</text>
        <text x="450" y="300" fill="#1A2535" fontSize="26" fontWeight="900" opacity="0.35">۳</text>
        <text x="680" y="500" fill="#1A2535" fontSize="26" fontWeight="900" opacity="0.35">۴</text>
        <text x="90" y="500" fill="#1A2535" fontSize="26" fontWeight="900" opacity="0.35">۲</text>
        <text x="430" y="560" fill="#1A2535" fontSize="20" fontWeight="900" opacity="0.35">۶</text>
      </svg>

      {/* Pins */}
      {billboards.map(b=>{
        const isSelected = selectedId===b.id;
        const isCompared = compareIds.includes(b.id);
        const pinColor = isSelected?"var(--accent-warm)":isCompared?"#9333ea":b.status==="available"?"var(--accent)":"var(--red)";
        const glowColor = isSelected?"rgba(255,179,0,0.4)":isCompared?"rgba(147,51,234,0.3)":b.status==="available"?"rgba(255,77,0,0.3)":"rgba(239,68,68,0.3)";
        return (
          <div key={b.id} onClick={()=>onSelect(b)} style={{position:"absolute",left:`${b.mapX}%`,top:`${b.mapY}%`,transform:"translate(-50%,-100%)",cursor:"pointer",zIndex:isSelected?20:10,transition:"all 0.2s"}}>
            {/* Pulse ring for selected */}
            {isSelected && <div style={{position:"absolute",inset:-8,borderRadius:"50%",border:`2px solid ${pinColor}`,opacity:0.5,animation:"pulse-glow 1.5s infinite"}}/>}
            {/* Pin body */}
            <div style={{width:36,height:36,borderRadius:"50% 50% 50% 0",transform:"rotate(-45deg)",background:pinColor,display:"flex",alignItems:"center",justifyContent:"center",border:"2px solid rgba(255,255,255,0.15)",boxShadow:`0 4px 14px ${glowColor}, 0 2px 6px rgba(0,0,0,0.5)`,transition:"all 0.2s"}}>
              <span style={{transform:"rotate(45deg)",fontSize:"0.85rem"}}>📋</span>
            </div>
            {/* Tooltip */}
            <div style={{position:"absolute",bottom:"calc(100% + 6px)",right:"50%",transform:"translateX(50%)",background:"var(--bg-card)",border:`1px solid ${pinColor}44`,borderRadius:8,padding:"7px 11px",whiteSpace:"nowrap",minWidth:160,boxShadow:"0 8px 24px rgba(0,0,0,0.6)",pointerEvents:"none",opacity:isSelected?1:0,transition:"opacity 0.2s",zIndex:30}}>
              <div style={{fontSize:"0.75rem",fontWeight:600,marginBottom:2}}>{b.name.substring(0,28)}...</div>
              <div style={{fontSize:"0.68rem",color:"var(--text-muted)",marginBottom:3}}>{b.region} · {b.width}×{b.height}م</div>
              <div style={{fontSize:"0.8rem",fontWeight:700,color:"var(--accent-warm)"}}>{b.price}M تومان/ماه</div>
              <div style={{fontSize:"0.68rem",color:"var(--green)",marginTop:2}}>👁 ~{Math.round(b.traffic.estimatedViews/1000)}K بازدید/روز</div>
            </div>
          </div>
        );
      })}

      {/* Hover tooltips — always visible on hover via CSS */}
      <style>{`.map-pin-wrap:hover .pin-tip{opacity:1!important}`}</style>

      {/* Controls */}
      <div style={{position:"absolute",left:14,top:14,display:"flex",flexDirection:"column",gap:6}}>
        {["＋","－","📍","🗺️"].map((icon,i)=>(
          <button key={i} style={{width:36,height:36,background:"var(--bg-card)",border:"1px solid var(--border)",borderRadius:8,color:"var(--text-main)",fontSize:"0.95rem",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",transition:"all 0.2s"}}>
            {icon}
          </button>
        ))}
      </div>

      {/* Stats */}
      <div style={{position:"absolute",top:14,right:14,display:"flex",gap:8}}>
        {[
          {num:available,label:"خالی",color:"var(--accent)"},
          {num:busy,label:"مشغول",color:"var(--red)"},
          {num:billboards.length,label:"کل",color:"var(--text-main)"},
        ].map(s=>(
          <div key={s.label} style={{background:"rgba(17,24,39,0.92)",border:"1px solid var(--border)",borderRadius:8,padding:"7px 14px",backdropFilter:"blur(8px)",textAlign:"center"}}>
            <div style={{fontSize:"1.1rem",fontWeight:700,color:s.color}}>{s.num}</div>
            <div style={{fontSize:"0.65rem",color:"var(--text-muted)"}}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Legend */}
      <div style={{position:"absolute",left:14,bottom:14,background:"rgba(17,24,39,0.92)",border:"1px solid var(--border)",borderRadius:8,padding:"10px 14px",backdropFilter:"blur(8px)"}}>
        <div style={{fontSize:"0.68rem",color:"var(--text-muted)",marginBottom:7,fontWeight:600}}>وضعیت رسانه‌ها</div>
        {[["var(--accent)","خالی"],["var(--red)","مشغول"],["var(--accent-warm)","انتخاب‌شده"],["#9333ea","در مقایسه"]].map(([c,l])=>(
          <div key={l} style={{display:"flex",alignItems:"center",gap:7,fontSize:"0.73rem",marginBottom:4}}>
            <div style={{width:10,height:10,borderRadius:"50%",background:c,flexShrink:0}}/>
            {l}
          </div>
        ))}
      </div>

      {/* No selection hint */}
      {!selectedId && (
        <div style={{position:"absolute",bottom:14,right:14,background:"rgba(17,24,39,0.85)",border:"1px solid var(--border)",borderRadius:8,padding:"9px 14px",backdropFilter:"blur(8px)",fontSize:"0.75rem",color:"var(--text-muted)",maxWidth:200,lineHeight:1.5}}>
          📋 روی پین‌ها کلیک کنید تا اطلاعات رسانه را ببینید
        </div>
      )}
    </div>
  );
}
