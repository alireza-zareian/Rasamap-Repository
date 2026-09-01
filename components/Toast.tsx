"use client";
import { useEffect } from "react";

interface Props {
  message: string;
  type?: "success"|"error"|"info";
  onClose: ()=>void;
}

export default function Toast({ message, type="info", onClose }: Props) {
  useEffect(()=>{
    const t = setTimeout(onClose, 3500);
    return ()=>clearTimeout(t);
  },[onClose]);

  const colors = {
    success:"var(--green)",
    error:"var(--red)",
    info:"var(--accent)",
  };

  return (
    <div style={{position:"fixed",bottom:80,left:"50%",transform:"translateX(-50%)",background:"var(--bg-card)",border:`1px solid ${colors[type]}`,borderRadius:10,padding:"12px 22px",fontSize:"0.85rem",zIndex:500,boxShadow:`0 8px 24px rgba(0,0,0,0.5), 0 0 0 1px ${colors[type]}22`,animation:"fadeIn 0.3s ease",maxWidth:400,textAlign:"center",lineHeight:1.5}}>
      {message}
    </div>
  );
}
