import { permanentRedirect } from "next/navigation";

/** The two-item compare grew into the campaign planner (§40); old links and bookmarks land there. */
export default function ComparePage(): never {
  permanentRedirect("/campaign");
}
