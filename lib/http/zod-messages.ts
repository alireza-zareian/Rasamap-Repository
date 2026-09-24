import { z, ZodIssueCode, type ZodErrorMap } from "zod";
import { faNum } from "@/lib/format";

/**
 * Persian defaults for every Zod refusal.
 *
 * A route answers a bad body with the first issue's message, and a schema that
 * gave no message of its own used to answer in Zod's English ("String must
 * contain at least 8 character(s)") — straight onto a Persian form, against
 * AGENTS.md rule 4. A schema's own message still wins; this is only the
 * fallback, so no refusal can reach a user in the wrong language.
 */
const persianErrors: ZodErrorMap = (issue, ctx) => {
  switch (issue.code) {
    case ZodIssueCode.invalid_type:
      return { message: issue.received === "undefined" ? "این فیلد الزامی است" : "نوع مقدار نامعتبر است" };

    case ZodIssueCode.too_small: {
      const min = faNum(Number(issue.minimum));
      if (issue.type === "string") return { message: `دست‌کم ${min} نویسه لازم است` };
      if (issue.type === "array")  return { message: `دست‌کم ${min} مورد لازم است` };
      return { message: `مقدار باید دست‌کم ${min} باشد` };
    }

    case ZodIssueCode.too_big: {
      const max = faNum(Number(issue.maximum));
      if (issue.type === "string") return { message: `حداکثر ${max} نویسه مجاز است` };
      if (issue.type === "array")  return { message: `حداکثر ${max} مورد مجاز است` };
      return { message: `مقدار باید حداکثر ${max} باشد` };
    }

    case ZodIssueCode.invalid_string:
      return { message: issue.validation === "email" ? "ایمیل معتبر نیست" : "قالب مقدار نامعتبر است" };

    case ZodIssueCode.invalid_enum_value:
    case ZodIssueCode.invalid_literal:
    case ZodIssueCode.invalid_union_discriminator:
      return { message: "مقدار انتخاب‌شده مجاز نیست" };

    case ZodIssueCode.not_multiple_of:
    case ZodIssueCode.not_finite:
      return { message: "عدد نامعتبر است" };

    default:
      return { message: ctx.defaultError && issue.message ? issue.message : "مقدار نامعتبر است" };
  }
};

z.setErrorMap(persianErrors);
