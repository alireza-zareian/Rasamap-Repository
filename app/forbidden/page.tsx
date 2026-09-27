import { ShieldOff } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = {
  title: "دسترسی مجاز نیست | رسامپ",
  // Nothing here is worth indexing, and the address only appears after a
  // refusal — so keep it out of search results entirely.
  robots: { index: false, follow: false },
};

/**
 * "You are signed in, but not as someone who may see this."
 *
 * Before this page existed, proxy.ts answered that case by redirecting to the
 * sign-in form. For a signed-out visitor that is right. For a customer who
 * followed a link to /admin it was actively misleading: they *were* signed in,
 * so being shown a sign-in form suggested their session had failed and left
 * them typing a password that was never the problem.
 *
 * §5 asks for a designed Persian page per status code, and 403 was the one
 * missing. It deliberately does not say what lives at the address it refused.
 */
export default function ForbiddenPage() {
  return (
    <StatusScreen
      icon={<ShieldOff size={52} strokeWidth={1.4} />}
      code="۴۰۳"
      title="دسترسی به این بخش ندارید"
      actions={<>
        <ButtonLink href="/dashboard" intent="primary">داشبورد من</ButtonLink>
        <ButtonLink href="/">بازگشت به خانه</ButtonLink>
      </>}
    >
      شما وارد حساب خود شده‌اید، ولی این بخش برای کارکنان است.
      اگر فکر می‌کنید اشتباهی رخ داده، با پشتیبانی تماس بگیرید.
    </StatusScreen>
  );
}
