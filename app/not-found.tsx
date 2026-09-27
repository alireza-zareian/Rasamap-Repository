import { StatusScreen } from "@/components/ui/StatusScreen";
import { ButtonLink } from "@/components/ui/Button";

export default function NotFound() {
  return (
    <StatusScreen
      code="۴۰۴"
      title="صفحه یافت نشد"
      actions={<ButtonLink href="/" intent="primary">بازگشت به خانه</ButtonLink>}
    >
      صفحه‌ای که دنبالش می‌گردید وجود ندارد یا جابه‌جا شده است.
    </StatusScreen>
  );
}
