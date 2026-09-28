"use client";
import Link from "next/link";
import type { ComponentProps } from "react";
import { useLastSearchHref } from "@/lib/client/last-search";

/** A link to the catalogue as the visitor left it (lib/client/last-search.ts). */
export default function SearchBackLink(props: Omit<ComponentProps<typeof Link>, "href">) {
  return <Link {...props} href={useLastSearchHref()} />;
}
