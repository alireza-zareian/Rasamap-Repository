"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { SectionCard } from "@/components/admin/Badge";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { Button } from "@/components/ui/Button";

/**
 * A failure inside one section. The menu and the top bar belong to the layout
 * above this boundary, so they stay: the admin can retry, or move to another
 * section, without the whole panel turning into an error page.
 */
export default function PanelError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <SectionCard>
      <StatusScreen
        inline
        icon={<TriangleAlert size={40} strokeWidth={1.5} />}
        tone="var(--accent-warm)"
        title="این بخش بارگذاری نشد"
        reference={error.digest}
        actions={<Button intent="primary" onClick={reset}>تلاش مجدد</Button>}
      >
        بقیهٔ پنل در دسترس است. دوباره امتحان کنید یا بخش دیگری را باز کنید.
      </StatusScreen>
    </SectionCard>
  );
}
