import { ShieldOff } from "lucide-react";
import { StatusScreen } from "@/components/ui/StatusScreen";
import { ButtonLink } from "@/components/ui/Button";

export const metadata = {
  title: "دسترسی مجاز نیست | رسامپ",
  robots: { index: false, follow: false },
};

/**
 * "Signed in, but not as someone who may see this" — where proxy.ts sends a
 * customer who follows a link to /admin, instead of a sign-in form that would
 * suggest the session failed. It does not say what the refused address holds.
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
