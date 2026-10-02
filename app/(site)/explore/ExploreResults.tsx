"use client";
import { useState, useCallback, useEffect, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Map as MapIcon } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import BillboardCard from "@/components/media/BillboardCard";
import CampaignTray from "@/components/campaign/CampaignTray";
import Toast from "@/components/ui/Toast";
import { faNum } from "@/lib/format";
import { MAX_PICKED, useCampaign } from "@/lib/client/use-campaign";
import styles from "./explore.module.css";

/**
 * The results grid. The cards come from the server as props; this is a Client
 * Component only for the campaign pick (lib/client/use-campaign.ts). It still
 * renders to HTML on the server.
 */

interface ToastState { msg: string; type: "success" | "error" | "info" }

// Its own chunk: the province outlines load only where the map is drawn.
const ResultsMap = dynamic(() => import("./ResultsMap"), { ssr: false });

/** Cards whose photos are fetched first: a phone shows the first whole, the second begun. */
const PRIORITY_CARDS = 2;

/** Wide enough for a map beside two columns of cards. Matches .withMap in the module. */
const WIDE = "(min-width: 1100px)";
const MAP_PREF_KEY = "rasamap_results_map";

function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
const isWide = () => window.matchMedia(WIDE).matches;

/** The map is on unless this visitor closed it; remembered per browser. */
function useMapPreference(): [boolean, (on: boolean) => void] {
  const [on, setOn] = useState(true);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem(MAP_PREF_KEY) === "off") setOn(false); } catch { /* storage unavailable: on */ }
  }, []);
  const set = useCallback((next: boolean) => {
    setOn(next);
    try { localStorage.setItem(MAP_PREF_KEY, next ? "on" : "off"); } catch { /* this page only */ }
  }, []);
  return [on, set];
}

export default function ExploreResults({ items, view }: { items: CatalogueItem[]; view: "grid" | "list" }) {
  const { items: picked, setItems: setPicked, remove, clear, ready } = useCampaign();
  const [toast, setToast] = useState<ToastState | null>(null);
  const [hovered, setHovered] = useState<string | null>(null);
  // False in the server render: the page is the same everywhere until the browser measures itself.
  const wide = useSyncExternalStore(subscribeWide, isWide, () => false);
  const [mapOn, setMapOn] = useMapPreference();
  const showMap = wide && mapOn;

  // The updater stays pure — React may run it again during hydration — so the
  // toast is decided from the list as it is on screen.
  const handlePick = useCallback((b: CatalogueItem) => {
    const inList = picked.some(x => x.id === b.id);
    if (!inList && picked.length >= MAX_PICKED) {
      setToast({ msg: `یک کمپین حداکثر ${faNum(MAX_PICKED)} رسانه دارد`, type: "error" });
      return;
    }
    setPicked(prev => prev.some(x => x.id === b.id)
      ? prev.filter(x => x.id !== b.id)
      : [...prev, b].slice(0, MAX_PICKED));
    if (!inList) setToast({ msg: `${b.name.substring(0, 22)}… به کمپین اضافه شد`, type: "info" });
  }, [picked, setPicked]);

  const closeToast = useCallback(() => setToast(null), []);

  return (
    <>
      <div className={showMap ? styles.withMap : undefined}>
        <div>
          {wide && !mapOn && (
            <button type="button" className={styles.mapOpen} onClick={() => setMapOn(true)}>
              <MapIcon size={14} /> نمایش نتایج روی نقشه
            </button>
          )}
          {/* Busy until the saved pick has been read. */}
          <div className={view === "grid" ? styles.grid : styles.list} data-testid="results" aria-busy={!ready}>
            {items.map((b, i) => (
              <BillboardCard
                key={b.id}
                billboard={b}
                priority={i < PRIORITY_CARDS && view === "grid"}
                isPicked={picked.some(x => x.id === b.id)}
                onPick={handlePick}
                listMode={view === "list"}
                highlighted={showMap && hovered === b.slug}
                onHover={showMap ? setHovered : undefined}
              />
            ))}
          </div>
        </div>
        {showMap && <ResultsMap items={items} active={hovered} onHover={setHovered} onClose={() => setMapOn(false)} />}
      </div>

      <CampaignTray items={picked} onRemove={remove} onClear={clear} />
      {toast && <Toast message={toast.msg} type={toast.type} onClose={closeToast} />}
    </>
  );
}
