"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, CircleCheckBig, ArrowRight, ArrowLeft, ChevronLeft } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/Button";
import form from "@/components/ui/form.module.css";
import { ListingFields } from "@/components/listing/ListingFields";
import { PhotoPicker } from "@/components/listing/PhotoPicker";
import { PlanPicker } from "@/components/listing/PlanPicker";
import { useListingForm, type ListingDraft } from "@/components/listing/use-listing-form";
import { fetchJson, FetchError, errorMessage, TIMEOUT_MS } from "@/lib/client/fetch-json";
import { MAX_LISTING_IMAGES, type ListingPlan } from "@/lib/domain/listing";
import styles from "./page.module.css";

const STEPS = ["اطلاعات اصلی", "موقعیت و نوع", "قیمت‌گذاری", "تصاویر", "انتخاب پلن", "تأیید"];
const PHOTO_STEP  = 3;
const SUBMIT_STEP = 4;   // the plan step is the last one with a submit button
const DONE_STEP   = 5;
/** The part of the form each of the first three steps holds. */
const STEP_GROUP = ["basic", "place", "size"] as const;

/**
 * One key per filled-in form, sent as Idempotency-Key. A submission that
 * outlives the client's timeout may still have landed; retrying with the same
 * key replays that answer instead of hitting the duplicate guard with a
 * confusing "already submitted". getRandomValues rather than randomUUID: the
 * latter exists only in a secure context, and the demo is opened over plain
 * http from a phone (AGENTS.md rule 9).
 */
function newIdempotencyKey(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join("");
}

/**
 * What survives a trip to the sign-in page when the session ran out mid-form.
 * The text fields only: five photographs are several times what sessionStorage
 * holds, so the owner is asked to add those again.
 */
const DRAFT_KEY = "rasamap:list-media-draft";
type SavedDraft = { form: ListingDraft; plan: ListingPlan };

function readDraft(): SavedDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    sessionStorage.removeItem(DRAFT_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<SavedDraft>;
    const formOk = typeof d.form === "object" && d.form !== null && Object.values(d.form).every(v => typeof v === "string");
    return formOk && (d.plan === "free" || d.plan === "featured") ? (d as SavedDraft) : null;
  } catch {
    return null;
  }
}

export default function ListMediaPage() {
  const router = useRouter();
  const listing = useListingForm();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [idempotencyKey] = useState(newIdempotencyKey);
  const { setDraft, setPlan } = listing;

  useEffect(() => {
    const saved = readDraft();
    if (!saved) return;
    // Restored once, after mount: sessionStorage does not exist while the
    // server renders this page, so it cannot be the initial state.
    setDraft(d => ({ ...d, ...saved.form }));
    setPlan(saved.plan);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setNotice("اطلاعاتی که وارد کرده بودید بازیابی شد. لطفاً تصاویر را دوباره اضافه کنید.");
  }, [setDraft, setPlan]);

  // A refresh or an accidental tab close mid-wizard would silently drop
  // everything typed; this at least stops the browser from doing it unasked.
  useEffect(() => {
    if (step === 0 || step >= DONE_STEP) return;
    const warn = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [step]);

  /** Whatever blocks leaving this step, in the words the server would use. */
  function stepProblem(current: number): string | null {
    if (current < STEP_GROUP.length) return listing.check(STEP_GROUP[current]);
    if (current === PHOTO_STEP && listing.photos.length === 0) return "حداقل یک تصویر از رسانه اضافه کنید.";
    return null;
  }

  function goNext() {
    const problem = stepProblem(step);
    if (problem) { setError(problem); return; }
    setError("");
    setStep(s => s + 1);
  }

  async function submit() {
    if (submitting) return;                 // ignore a double-tap mid-request
    setError("");
    setSubmitting(true);
    try {
      await fetchJson("/api/listings", {
        // The upload budget: five photographs over a mobile connection can
        // legitimately take most of a minute.
        timeoutMs: TIMEOUT_MS.upload,
        method: "POST",
        headers: { "Idempotency-Key": idempotencyKey },
        body: listing.toFormData(),
      });
      setStep(DONE_STEP);
    } catch (err) {
      // A session that expired while the form was being filled in is a trip to
      // the sign-in page and back, not an error to read.
      if (err instanceof FetchError && err.status === 401) {
        try { sessionStorage.setItem(DRAFT_KEY, JSON.stringify({ form: listing.draft, plan: listing.plan })); } catch { /* storage unavailable: the redirect still helps */ }
        router.push(`/login?next=${encodeURIComponent("/list-media")}`);
        return;
      }
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  const body = (() => {
    if (step < STEP_GROUP.length) return <ListingFields group={STEP_GROUP[step]} listing={listing} />;
    if (step === PHOTO_STEP) {
      return (
        <PhotoPicker photos={listing.photos} onChange={listing.setPhotos} max={MAX_LISTING_IMAGES} onError={setError} />
      );
    }
    if (step === SUBMIT_STEP) {
      return (
        <>
          <p className={styles.intro}>
            درآمد رسامپ از ثبت آگهی است، نه از اجاره‌کننده. اجاره و قرارداد مستقیماً بین شما و آگهی‌دهنده انجام می‌شود.
          </p>
          <PlanPicker plan={listing.plan} onChange={listing.setPlan} />
        </>
      );
    }
    return (
      <div className={styles.done}>
        <div className={styles.doneIcon}><CircleCheckBig size={52} strokeWidth={1.5} /></div>
        <div className={styles.doneTitle}>رسانهٔ شما با موفقیت ثبت شد!</div>
        <p className={styles.doneText}>
          {listing.plan === "featured"
            ? <>آگهی شما ثبت شد و در وضعیت «در انتظار پرداخت» است.<br />برای هماهنگی واریز، پشتیبانی با شما تماس می‌گیرد.</>
            : <>تیم رسامپ درخواست شما را بررسی می‌کند.<br />پس از تأیید، رسانهٔ شما در سایت نمایش داده می‌شود.</>}
          <br />وضعیت آگهی را می‌توانید در داشبورد دنبال کنید.
        </p>
        <ButtonLink href="/dashboard" intent="primary">رفتن به داشبورد</ButtonLink>
      </div>
    );
  })();

  return (
    <div className={styles.page}>
      <main className={styles.main}>
        <nav className={styles.crumbs} aria-label="مسیر">
          <Link href="/"><ArrowRight size={13} /> رسامپ</Link>
          <span className={styles.crumbSep}><ChevronLeft size={13} /></span>
          <span>ثبت رسانه</span>
        </nav>

        <ol className={styles.steps}>
          {STEPS.map((label, i) => (
            <li key={label} className={`${styles.step} ${step > i ? styles.stepDone : step === i ? styles.stepNow : ""}`} aria-current={step === i ? "step" : undefined}>
              <div className={styles.dot}>{step > i ? <Check size={14} /> : (i + 1).toLocaleString("fa-IR")}</div>
              {label}
            </li>
          ))}
        </ol>

        <div className={`${styles.card} gradient-frame`}>
          <h1 className={styles.cardHead}>{STEPS[step]}</h1>
          <div className={styles.cardBody}>{body}</div>
          {step < DONE_STEP && (
            <div className={styles.cardFoot}>
              {notice && !error && <div role="status" className={styles.notice}>{notice}</div>}
              {error && <div role="alert" className={form.error}>{error}</div>}
              <div className={styles.actions}>
                {step > 0 && (
                  <Button className={styles.back} onClick={() => { setError(""); setStep(s => s - 1); }}>
                    <ArrowRight size={14} /> قبلی
                  </Button>
                )}
                <Button
                  data-testid="wizard-next"
                  intent="primary"
                  className={`${styles.next} btn-sheen`}
                  onClick={step === SUBMIT_STEP ? submit : goNext}
                  disabled={submitting}
                >
                  {submitting ? "در حال ارسال…" : step === SUBMIT_STEP ? <><Check size={15} /> ثبت نهایی</> : <>بعدی <ArrowLeft size={14} /></>}
                </Button>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
