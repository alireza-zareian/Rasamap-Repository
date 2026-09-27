"use client";
import { useEffect } from "react";
import { TriangleAlert } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { Button, ButtonLink } from "@/components/ui/Button";

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);

  return (
    <StatusScreen
      icon={<TriangleAlert size={56} strokeWidth={1.5} />}
      tone="var(--accent-warm)"
      title="خطایی رخ داد"
      reference={error.digest}
      actions={<>
        <Button intent="primary" onClick={reset}>تلاش مجدد</Button>
        <ButtonLink href="/" intent="quiet">صفحه اصلی</ButtonLink>
      </>}
    >
      مشکلی در بارگذاری این صفحه پیش آمد. لطفاً دوباره امتحان کنید.
    </StatusScreen>
  );
}
