"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { faNum } from "@/lib/format";
import { Button } from "@/components/ui/Button";
import styles from "./landing.module.css";

/**
 * The hero's search: free text and, optionally, a city. The city list is the
 * catalogue's own — every city with published media, busiest first — rather
 * than six names typed into the page, and it starts on "every city": opening
 * on Tehran quietly hid 80% of the catalogue from anyone who just typed.
 */
export default function LandingSearch({ cities }: { cities: [name: string, count: number][] }) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");

  const go = (e: React.FormEvent) => {
    e.preventDefault();
    const q = new URLSearchParams();
    if (search.trim()) q.set("search", search.trim());
    if (city) q.set("city", city);
    router.push(q.size ? `/explore?${q}` : "/explore");
  };

  return (
    <form className={`${styles.search} gradient-frame`} onSubmit={go} role="search">
      <select className={styles.searchCity} value={city} onChange={e => setCity(e.target.value)} aria-label="شهر">
        <option value="">همهٔ شهرها</option>
        {cities.map(([name, count]) => <option key={name} value={name}>{name} ({faNum(count)})</option>)}
      </select>
      <input
        className={styles.searchInput}
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="منطقه، خیابان، نوع رسانه…"
        aria-label="جستجو"
        enterKeyHint="search"
      />
      <Button type="submit" intent="primary" className="btn-sheen">
        <Search size={14} /> جستجو
      </Button>
    </form>
  );
}
