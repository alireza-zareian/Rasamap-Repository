"use client";
import { useEffect, useState } from "react";
import { Phone } from "lucide-react";
import type { CatalogueItem } from "@/lib/types";
import SaveButton from "@/components/favorites/SaveButton";
import AddToCampaign from "@/components/campaign/AddToCampaign";
import { faNum } from "@/lib/format";
import styles from "./action-bar.module.css";

/**
 * The phone's bar on a media page (§40): the price, save, campaign and the way
 * to the owner, always under the thumb. On a phone the price card sits under
 * the photos and scrolls away; the bar shows only while it is out of view, so
 * the two are never on screen together. Hidden above 768px, where the card is
 * sticky beside the content.
 */
export default function MediaActionBar({ item, contactId }: { item: CatalogueItem; contactId: string }) {
  const [cardInView, setCardInView] = useState(true);

  useEffect(() => {
    const card = document.getElementById(contactId);
    if (!card) return;
    const observer = new IntersectionObserver(([entry]) => setCardInView(entry.isIntersecting), { threshold: 0.15 });
    observer.observe(card);
    return () => observer.disconnect();
  }, [contactId]);

  const toContact = () => {
    const card = document.getElementById(contactId);
    if (!card) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    card.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
    // The first thing to act on in the card: sign in, or reveal the number.
    card.querySelector<HTMLElement>("a, button")?.focus({ preventScroll: true });
  };

  return (
    // `inert` while hidden: aria-hidden alone left its buttons in the tab order.
    <div className={`${styles.bar} ${cardInView ? styles.hidden : ""}`} inert={cardInView}>
      <div className={styles.price}>
        <strong>{faNum(item.price)}</strong>
        <span>میلیون / ماه</span>
      </div>
      <SaveButton slug={item.slug} name={item.name} variant="icon" />
      <AddToCampaign item={item} compact />
      <button type="button" className={styles.call} onClick={toContact}>
        <Phone size={16} /> تماس
      </button>
    </div>
  );
}
