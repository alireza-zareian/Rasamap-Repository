"use client";
import { Billboard } from "@/lib/data";
import { Scale, X } from "lucide-react";

interface Props {
  items: Billboard[];
  onRemove: (id:number)=>void;
  onCompare: ()=>void;
  onClear: ()=>void;
}

export default function CompareBar({ items, onRemove, onCompare, onClear }: Props) {
  if (items.length === 0) return null;

  return (
    <div style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:"var(--bg-card)",borderTop:"2px solid var(--accent)",padding:"11px 22px",display:"flex",alignItems:"center",gap:12,animation:"slideUp 0.3s ease",boxShadow:"0 -4px 24px rgba(59,123,245,0.10)"}}>
      <div style={{fontSize:"0.82rem",fontWeight:700,color:"var(--accent)",flexShrink:0,display:"flex",alignItems:"center",gap:5}}><Scale size={15}/> مقایسه</div>

      <div style={{display:"flex",gap:8,flex:1}}>
        {[items[0]||null, items[1]||null].map((b,i)=>
          b ? (
            <div key={b.id} style={{background:"var(--bg-surface)",border:"1px solid var(--accent-warm)",borderRadius:8,padding:"6px 12px",fontSize:"0.78rem",display:"flex",alignItems:"center",gap:8,minWidth:160}}>
              <span>{b.icon}</span>
              <span style={{flex:1}}>{b.name.substring(0,22)}...</span>
              <button onClick={()=>onRemove(b.id)} style={{background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",padding:0,display:"flex"}}><X size={13}/></button>
            </div>
          ) : (
            <div key={i} style={{background:"var(--bg-surface)",border:"1px dashed var(--border)",borderRadius:8,padding:"6px 20px",fontSize:"0.75rem",color:"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",minWidth:160}}>
              + رسانه {i===0?"اول":"دوم"}
            </div>
          )
        )}
      </div>

      <button onClick={onClear} style={{border:"1px solid var(--border)",background:"none",color:"var(--text-muted)",fontFamily:"inherit",fontSize:"0.78rem",padding:"7px 14px",borderRadius:8,cursor:"pointer"}}>پاک</button>
      <button onClick={onCompare} disabled={items.length<2} style={{background:items.length<2?"var(--border)":"var(--accent-warm)",border:"none",color:items.length<2?"var(--text-muted)":"#111",fontFamily:"inherit",fontSize:"0.82rem",fontWeight:700,padding:"8px 20px",borderRadius:8,cursor:items.length<2?"not-allowed":"pointer",transition:"all 0.2s"}}>
        {items.length<2?"یک رسانه دیگر انتخاب کن":"مقایسه کن ←"}
      </button>
    </div>
  );
}
