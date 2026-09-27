"use client";
import { useId, useState } from "react";
import { provinces, findProvinceOfCity } from "@/lib/geo/iran-cities";
import form from "@/components/ui/form.module.css";
import styles from "./listing.module.css";

/**
 * Province, then city — every city the catalogue lists (lib/geo/iran-cities.ts),
 * so a board in Karaj or Khorramabad can be listed. The form used to offer
 * seven cities and nothing else.
 */
export function CitySelect({ city, onChange }: { city: string; onChange: (city: string) => void }) {
  const id = useId();
  const [province, setProvince] = useState(() => findProvinceOfCity(city)?.name ?? provinces[0].name);
  const cities = provinces.find(p => p.name === province)?.cities ?? [];

  return (
    <div className={styles.pair}>
      <div className={form.field}>
        <label htmlFor={`${id}-province`} className={form.label}>استان</label>
        <select
          id={`${id}-province`}
          className={form.input}
          value={province}
          onChange={e => {
            const next = provinces.find(p => p.name === e.target.value);
            setProvince(e.target.value);
            // The province's first city — its capital in this list — until one is picked.
            if (next) onChange(next.cities[0].name);
          }}
        >
          {provinces.map(p => <option key={p.name} value={p.name}>{p.name}</option>)}
        </select>
      </div>
      <div className={form.field}>
        <label htmlFor={`${id}-city`} className={form.label}>شهر</label>
        <select id={`${id}-city`} className={form.input} value={city} onChange={e => onChange(e.target.value)}>
          {cities.map(c => <option key={c.name} value={c.name}>{c.name}</option>)}
        </select>
      </div>
    </div>
  );
}
