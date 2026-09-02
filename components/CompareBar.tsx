"use client";
import { Billboard } from "@/lib/types";
import { Scale, X, ArrowLeft } from "lucide-react";
import { TypeIcon } from "@/components/TypeIcon";

interface Props {
  items: Billboard[];
  onRemove: (id:number)=>void;
  onCompare: ()=>void;
  onClear: ()=>void;
}

export default function CompareBar({ items, onRemove, onCompare, onClear }: Props) {
  if (items.length === 0) return null;

  return (
    <div className="compare-bar" style={{position:"fixed",bottom:0,left:0,right:0,zIndex:200,background:"var(--bg-card)",borderTop:"2px solid var(--accent)",padding:"11px 22px",display:"flex",alignItems:"center",gap:12,flexWrap:"wrap",animation:"slideUp 0.3s ease",boxShadow:"0 -4px 24px rgba(59,123,245,0.10)"}}>
      <div style={{fontSize:"0.82rem",fontWeight:700,color:"var(--accent)",flexShrink:0,display:"flex",alignItems:"center",gap:5}}><Scale size={15}/> مقایسه</div>

      <div className="compare-bar-chips" style={{display:"flex",gap:8,flex:1,minWidth:0}}>
        {[items[0]||null, items[1]||null].map((b,i)=>
          b ? (
            <div key={b.id} style={{background:"var(--bg-surface)",border:"1px solid var(--accent-warm)",borderRadius:8,padding:"6px 12px",fontSize:"0.78rem",display:"flex",alignItems:"center",gap:8,flex:1,minWidth:0}}>
              <span style={{display:"flex",flexShrink:0,color:"var(--text-muted)"}}><TypeIcon type={b.type} size={14} /></span>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{b.name}</span>
              <button onClick={()=>onRemove(b.id)} style={{background:"none",border:"none",color:"var(--text-muted)",cursor:"pointer",padding:0,display:"flex",flexShrink:0}}><X size={13}/></button>
            </div>
          ) : (
            <div key={i} style={{background:"var(--bg-surface)",border:"1px dashed var(--border)",borderRadius:8,padding:"6px 12px",fontSize:"0.75rem",color:"var(--text-muted)",display:"flex",alignItems:"center",justifyContent:"center",flex:1,minWidth:0}}>
              + رسانه {i===0?"اول":"دوم"}
            </div>
          )
        )}
      </div>

      <div className="compare-bar-actions" style={{display:"flex",gap:8,flexShrink:0}}>
        <button onClick={onClear} style={{border:"1px solid var(--border)",background:"none",color:"var(--text-muted)",fontFamily:"inherit",fontSize:"0.78rem",padding:"7px 14px",borderRadius:8,cursor:"pointer"}}>پاک</button>
        <button onClick={onCompare} disabled={items.length<2} style={{background:items.length<2?"var(--border)":"var(--accent-warm)",border:"none",color:items.length<2?"var(--text-muted)":"#111",fontFamily:"inherit",fontSize:"0.82rem",fontWeight:700,padding:"8px 20px",borderRadius:8,cursor:items.length<2?"not-allowed":"pointer",transition:"all 0.2s",whiteSpace:"nowrap",display:"inline-flex",alignItems:"center",justifyContent:"center",gap:5}}>
          {items.length<2?"۱ رسانه دیگر":<>مقایسه کن <ArrowLeft size={14} /></>}
        </button>
      </div>
    </div>
  );
}
