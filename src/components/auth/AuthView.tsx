'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, FileText, LockKeyhole, Mail, SearchCheck, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { loginWithPassword, requestPasswordReset, signInWithGoogle, signupWithPassword } from "@/lib/auth/actions";
import { authFormSchema, recoveryFormSchema, signupFormSchema, type AuthFormValues, type RecoveryFormValues } from "@/lib/auth/schema";
import styles from "./AuthView.module.css";

type AuthViewProps = {
  mode?: "signin" | "signup";
};

type View = "main" | "recovery" | "recoverySent" | "signupSent";
type BarState = "idle" | "pending" | "done";

const ANSWER_CHUNKS = [
  { cite: 1, text: "Operating margin improved to 18.7% on productivity gains and lower operating costs," },
  { cite: 2, text: "while operating expenses decreased 6.3% QoQ," },
  { cite: 3, text: "with productivity initiatives delivering $12.4M in annualized savings." },
];

const CITE_ARIA = [
  "Citation 1: Q2 Board Deck.pdf, page 7. Select to highlight its evidence.",
  "Citation 2: Financials.xlsx, sheet P&L. Select to highlight its evidence.",
  "Citation 3: Management Memo.pdf, page 3. Select to highlight its evidence.",
];

const DEMO_SOURCES = [
  { id: 1, title: "Q2 Board Deck.pdf", location: "p.7", snippet: "Operating margin improved to 18.7%, driven by lower operating costs…" },
  { id: 2, title: "Financials.xlsx", location: "Sheet: P&L", snippet: "The P&L shows operating expenses decreased 6.3% QoQ…" },
  { id: 3, title: "Management Memo.pdf", location: "p.3", snippet: "Productivity initiatives delivered $12.4M in annualized savings…" },
];

const CHECKS = [
  "Every answer is tied to a source passage.",
  "Spreadsheet rows and documents stay in one private workspace.",
  "Citations remain visible before you rely on the answer.",
];

const CHART_POINTS = [
  { x: 60, y: 81.8, label: "12.4", cites: "2" },
  { x: 170, y: 67, label: "15.1", cites: "2" },
  { x: 280, y: 74.1, label: "13.8", cites: "2" },
  { x: 390, y: 77.4, label: "13.2", cites: "2" },
  { x: 500, y: 47.2, label: "18.7", cites: "1 2" },
];

const CHART_QUARTERS = [
  "Q2 FY24",
  "Q3 FY24",
  "Q4 FY24",
  "Q1 FY25",
  "Q2 FY25",
];

function barClasses(state: BarState) {
  return `${styles.bar} ${state === "pending" ? styles.barPending : ""} ${state === "done" ? styles.barDone : ""}`;
}

export function AuthView({ mode = "signin" }: AuthViewProps) {
  const router = useRouter();
  const isSignup = mode === "signup";
  const [view, setView] = useState<View>("main");
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bar, setBar] = useState<BarState>("idle");
  const [announce, setAnnounce] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [selCite, setSelCite] = useState<number | null>(null);
  const [hoverCite, setHoverCite] = useState<number | null>(null);
  const [recoveryBar, setRecoveryBar] = useState<BarState>("idle");
  const [signupEmail, setSignupEmail] = useState("");
  const forgotRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<string | null>(null);
  const timersRef = useRef<number[]>([]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(isSignup ? signupFormSchema : authFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  const recoveryForm = useForm<RecoveryFormValues>({
    resolver: zodResolver(recoveryFormSchema),
    defaultValues: {
      email: "",
    },
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const target = document.getElementById(pendingFocusRef.current);
    pendingFocusRef.current = null;
    target?.focus();
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("auth");
    if (code === "confirm-failed" || code === "confirm-invalid") {
      setAuthError("That confirmation link is no longer valid. Sign in again or request a new link.");
    } else if (code === "error") {
      setAuthError("Unable to complete sign-in. Please try again.");
    }
  }, []);

  const emailRegistration = register("email", {
    onBlur: () => {
      const value = getValues("email");
      if (!value.trim()) setFieldErrors((prev) => ({ ...prev, email: "Enter your email." }));
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) setFieldErrors((prev) => ({ ...prev, email: "Enter a valid work email address." }));
      else setFieldErrors((prev) => ({ ...prev, email: undefined }));
    },
    onChange: () => setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev)),
  });

  const passwordRegistration = register("password", {
    onBlur: () => {
      const value = getValues("password");
      setFieldErrors((prev) => ({ ...prev, password: value ? undefined : "Enter your password." }));
      setCapsLock(false);
    },
    onChange: () => setFieldErrors((prev) => (prev.password ? { ...prev, password: undefined } : prev)),
  });

  const emailError = errors.email?.message ?? fieldErrors.email;
  const passwordError = errors.password?.message ?? fieldErrors.password;

  function finishBar(setter: (state: BarState) => void) {
    setter("done");
    timersRef.current.push(window.setTimeout(() => setter("idle"), 480));
  }

  async function onLoginSubmit(values: AuthFormValues) {
    setAuthError(null);
    setIsSubmitting(true);
    setBar("pending");
    try {
      const result = await loginWithPassword(values);
      if (result.status === "error") {
        setAuthError(result.message);
        setAnnounce(result.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
      finishBar(setBar);
    }
  }

  async function onSignupSubmit(values: AuthFormValues) {
    setAuthError(null);
    setIsSubmitting(true);
    setBar("pending");
    try {
      const result = await signupWithPassword(values);
      if (result.status === "error") {
        setAuthError(result.message);
        setAnnounce(result.message);
        return;
      }
      setSignupEmail(values.email);
      setView("signupSent");
      setAnnounce("Confirmation email requested.");
    } finally {
      setIsSubmitting(false);
      finishBar(setBar);
    }
  }

  async function onRecoverySubmit(values: RecoveryFormValues) {
    setAuthError(null);
    setRecoveryBar("pending");
    try {
      await requestPasswordReset(values);
      setView("recoverySent");
      setAnnounce("Recovery instructions requested.");
    } finally {
      setRecoveryBar("done");
      timersRef.current.push(window.setTimeout(() => setRecoveryBar("idle"), 480));
    }
  }

  async function handleGoogle() {
    setAuthError(null);
    setIsSubmitting(true);
    setBar("pending");
    try {
      const result = await signInWithGoogle();
      if (result.status === "error") {
        setIsSubmitting(false);
        finishBar(setBar);
        setAuthError(result.message);
        setAnnounce(result.message);
        return;
      }
      window.location.assign(result.redirectUrl);
    } catch {
      setIsSubmitting(false);
      finishBar(setBar);
      const message = "Unable to start Google sign-in right now. Please try again.";
      setAuthError(message);
      setAnnounce(message);
    }
  }

  function openRecovery() {
    recoveryForm.setValue("email", getValues("email"));
    setView("recovery");
    pendingFocusRef.current = "recovery-email";
    setAnnounce("Account recovery view opened.");
  }

  function backToMain(focusId: string) {
    setView("main");
    pendingFocusRef.current = focusId;
    setAnnounce("Returned to the sign-in form.");
  }

  function onCapsCheck(event: ReactKeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  function toggleCite(id: number) {
    const next = selCite === id ? null : id;
    setSelCite(next);
    setAnnounce(next === null ? "Citation deselected." : `Citation ${next} selected; matching evidence highlighted.`);
  }

  return (
    <main className={styles.shell}>
      <a className={styles.skip} href="#auth-form">Skip to the form</a>
      <section className={styles.paneForm} aria-label={isSignup ? "Create account" : "Sign in"}>
        <header className={styles.brandRow}>
          <Link href="/" className={styles.brand} aria-label="Pliny home">Pliny</Link>
        </header>
        <div className={styles.formCol}>
          {view === "main" ? (
            <div className={styles.view}>
              <div className={styles.statusSlot}>
                {authError ? (
                  <div className={styles.notice} role="alert">
                    <span>{authError}</span>
                  </div>
                ) : null}
              </div>
              <p className={styles.eyebrow}>{isSignup ? "CREATE ACCOUNT" : "SECURE ACCESS"}</p>
              <h1 className={styles.title}>{isSignup ? "Create your Pliny account" : "Sign in to your workspace"}</h1>
              <p className={styles.lede}>
                {isSignup
                  ? "We email you a confirmation link before your account can sign in. No workspace is created until your email is verified."
                  : "Access your documents and their answers. Every response is backed by source passages."}
              </p>
              <form
                id="auth-form"
                className={styles.form}
                onSubmit={handleSubmit(isSignup ? onSignupSubmit : onLoginSubmit)}
                noValidate
              >
                <div className={styles.field}>
                  <Label htmlFor="email" className={styles.label}>Email</Label>
                  <span className={styles.control}>
                    <Mail className={styles.leadIcon} aria-hidden="true" />
                    <Input
                      id="email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      className={`${styles.input} ${emailError ? styles.bad : ""}`}
                      aria-invalid={emailError ? "true" : "false"}
                      aria-describedby="email-msg"
                      {...emailRegistration}
                    />
                  </span>
                  <p id="email-msg" className={styles.msg} aria-live="polite">{emailError ?? ""}</p>
                </div>
                <div className={styles.field}>
                  <span className={styles.labelRow}>
                    <Label htmlFor="password" className={styles.label}>Password</Label>
                    {isSignup ? null : (
                      <button ref={forgotRef} type="button" className={styles.flink} onClick={openRecovery}>Forgot password?</button>
                    )}
                  </span>
                  <span className={`${styles.control} ${showPassword ? styles.show : ""}`}>
                    <LockKeyhole className={styles.leadIcon} aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete={isSignup ? "new-password" : "current-password"}
                      placeholder="Enter your password"
                      className={`${styles.input} ${passwordError ? styles.bad : ""}`}
                      aria-invalid={passwordError ? "true" : "false"}
                      aria-describedby="password-msg"
                      onKeyDown={onCapsCheck}
                      onKeyUp={onCapsCheck}
                      {...passwordRegistration}
                    />
                    <button
                      type="button"
                      className={styles.peek}
                      aria-pressed={showPassword}
                      aria-label={showPassword ? "Hide password" : "Show password"}
                      onClick={() => {
                        setShowPassword((visible) => !visible);
                        setAnnounce(showPassword ? "Password hidden." : "Password visible.");
                      }}
                    >
                      {showPassword ? "HIDE" : "SHOW"}
                    </button>
                  </span>
                  <p id="password-msg" className={styles.msg} aria-live="polite">{passwordError ?? ""}</p>
                  <p className={`${styles.caps} ${capsLock ? styles.capsOn : ""}`} aria-live="polite">{capsLock ? "CAPS LOCK IS ON" : ""}</p>
                </div>
                <button type="submit" className={styles.btn} disabled={isSubmitting}>
                  {isSubmitting ? "Please wait" : isSignup ? "Create account" : "Sign in"}
                </button>
                <button type="button" className={styles.ghost} disabled={isSubmitting} onClick={handleGoogle}>
                  Continue with Google
                </button>
                <span className={barClasses(bar)} aria-hidden="true"><span className={styles.barFill} /></span>
              </form>
              <div className={styles.foot}>
                <p className={styles.footNote}>
                  {isSignup
                    ? "Already have a confirmed account? Sign in with your email and password."
                    : "New to Pliny? Create an account and confirm your email to get started."}
                </p>
                {isSignup ? (
                  <Link href="/login" className={styles.flinkCenter}>Sign in</Link>
                ) : (
                  <Link href="/signup" className={styles.flinkCenter}>Create account</Link>
                )}
                <p className={styles.privacy}>
                  <ShieldCheck className={styles.privacyIcon} aria-hidden="true" />
                  Your documents stay private. Every answer shows exactly where it came from.
                </p>
              </div>
            </div>
          ) : null}

          {view === "recovery" ? (
            <div className={styles.view}>
              <button type="button" className={styles.backLink} onClick={() => backToMain("email")}>← Back to sign in</button>
              <p className={styles.eyebrow}>ACCOUNT RECOVERY</p>
              <h1 className={styles.title}>Reset your password</h1>
              <p className={styles.lede}>Enter the email you use for Pliny and we&apos;ll explain the next step.</p>
              <form className={styles.form} onSubmit={recoveryForm.handleSubmit(onRecoverySubmit)} noValidate>
                <div className={styles.field}>
                  <Label htmlFor="recovery-email" className={styles.label}>Email</Label>
                  <span className={styles.control}>
                    <Mail className={styles.leadIcon} aria-hidden="true" />
                    <Input
                      id="recovery-email"
                      type="email"
                      autoComplete="email"
                      placeholder="name@company.com"
                      className={styles.input}
                      aria-invalid={recoveryForm.formState.errors.email ? "true" : "false"}
                      aria-describedby="recovery-email-msg"
                      {...recoveryForm.register("email")}
                    />
                  </span>
                  <p id="recovery-email-msg" className={styles.msg} aria-live="polite">
                    {recoveryForm.formState.errors.email?.message ?? ""}
                  </p>
                </div>
                <button type="submit" className={styles.btn} disabled={recoveryBar === "pending"}>Send recovery instructions</button>
                <span className={barClasses(recoveryBar)} aria-hidden="true"><span className={styles.barFill} /></span>
              </form>
              <button type="button" className={styles.ghost} onClick={() => backToMain("email")}>Back to sign in</button>
            </div>
          ) : null}

          {view === "recoverySent" ? (
            <div className={styles.view}>
              <div className={styles.confirm} role="status">
                <h2 className={styles.confirmTitle}>Check your inbox</h2>
                <p className={styles.confirmBody}>If an account exists for this email, recovery instructions will be sent. The link expires 30 minutes after issue.</p>
              </div>
              <button type="button" className={styles.ghost} onClick={() => backToMain("email")}>Back to sign in</button>
            </div>
          ) : null}

          {view === "signupSent" ? (
            <div className={styles.view}>
              <div className={styles.confirm} role="status">
                <h2 className={styles.confirmTitle}>Confirm your email</h2>
                <p className={styles.confirmBody}>
                  We sent a confirmation link to {signupEmail || "your email"}. Follow it to activate your account, then sign in.
                </p>
              </div>
              <Link href="/login" className={styles.ghost}>Back to sign in</Link>
            </div>
          ) : null}
        </div>
      </section>

      <section className={styles.paneDemo} aria-label="Source-backed answers demonstration">
        <div className={styles.demoWrap}>
          <p className={styles.eyebrow}>SOURCE-BACKED ANSWERS</p>
          <h2 className={styles.demoTitle}>Review documents with the source beside you.</h2>
          <div className={styles.card}>
            <header className={styles.cardHead}>
              <div>
                <p className={styles.cardTitle}>Q2 Board Pack</p>
                <p className={styles.cardSub}>12 documents</p>
              </div>
              <span className={styles.pills}>
                <span className={styles.pill}><span className={styles.pillDot} aria-hidden="true" />PRIVACY-MINIMISED</span>
                <span className={styles.pill}>3 citations</span>
              </span>
            </header>
            <div className={styles.cardGrid}>
              <div className={styles.cardBody}>
                <p className={styles.qbubble}>What changed operating margin in Q2?</p>
                <p className={styles.ansHead}><FileText className={styles.ansIcon} aria-hidden="true" />Answer</p>
                <p className={styles.answer}>
                  {ANSWER_CHUNKS.map((chunk) => (
                    <span
                      key={chunk.cite}
                      className={`${styles.chunk} ${selCite === chunk.cite ? styles.sel : ""} ${hoverCite === chunk.cite ? styles.hi : ""}`}
                    >
                      {chunk.text}
                      <button
                        type="button"
                        className={`${styles.cite} ${selCite === chunk.cite ? styles.sel : ""}`}
                        aria-label={CITE_ARIA[chunk.cite - 1]}
                        aria-pressed={selCite === chunk.cite}
                        onClick={() => toggleCite(chunk.cite)}
                        onMouseEnter={() => setHoverCite(chunk.cite)}
                        onMouseLeave={() => setHoverCite(null)}
                        onFocus={() => setHoverCite(chunk.cite)}
                        onBlur={() => setHoverCite(null)}
                      >
                        {chunk.cite}
                      </button>
                    </span>
                  ))}
                </p>
                <div className={styles.kpi}>
                  <div className={styles.kpiHead}>
                    <div>
                      <p className={styles.kpiTitle}>Operating Margin</p>
                      <p className={styles.kpiSub}>Quarterly trend · units % of revenue</p>
                    </div>
                    <span className={styles.kpiVal}>18.7%</span>
                  </div>
                  <svg className={styles.chart} viewBox="0 0 560 150" fill="none" role="img" aria-label="Operating margin quarterly trend chart, units percent of revenue.">
                    <g stroke="#EAEAEA" strokeWidth="1">
                      <path d="M44 18H540" />
                      <path d="M44 40H540" />
                      <path d="M44 62H540" />
                      <path d="M44 84H540" />
                      <path d="M44 106H540" />
                    </g>
                    <g fill="#6E6E73" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="end">
                      <text x="36" y="21">24%</text>
                      <text x="36" y="43">20%</text>
                      <text x="36" y="65">16%</text>
                      <text x="36" y="87">12%</text>
                      <text x="36" y="109">8%</text>
                    </g>
                    <path d="M60 81.8L170 67L280 74.1L390 77.4L500 47.2" stroke="#AE4E24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {CHART_POINTS.map((point, index) => (
                      <g key={point.label} className={`${styles.pt} ${selCite !== null && point.cites.split(" ").includes(String(selCite)) ? styles.sel : ""}`} data-cite={point.cites}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="3.2"
                          fill={index === CHART_POINTS.length - 1 ? "#AE4E24" : "#FFFFFF"}
                          stroke="#AE4E24"
                          strokeWidth="1.6"
                        />
                        <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize="10" fill="#5F5F64" fontFamily="var(--font-jetbrains-mono), monospace">
                          {point.label}
                        </text>
                      </g>
                    ))}
                    <g fill="#6E6E73" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="middle">
                      {CHART_QUARTERS.map((quarter, index) => (
                        <text key={quarter} x={CHART_POINTS[index].x} y="134">{quarter}</text>
                      ))}
                    </g>
                  </svg>
                </div>
                <ul className={styles.checks}>
                  {CHECKS.map((check) => (
                    <li key={check} className={styles.check}>
                      <CheckCircle2 className={styles.checkIcon} aria-hidden="true" />
                      <span>{check}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className={styles.sources}>
                <p className={styles.sourcesHead}><SearchCheck className={styles.ansIcon} aria-hidden="true" />Sources</p>
                {DEMO_SOURCES.map((source) => (
                  <button
                    key={source.id}
                    type="button"
                    className={`${styles.srcCard} ${selCite === source.id ? styles.sel : ""}`}
                    aria-pressed={selCite === source.id}
                    onClick={() => toggleCite(source.id)}
                    onMouseEnter={() => setHoverCite(source.id)}
                    onMouseLeave={() => setHoverCite(null)}
                  >
                    <FileText className={styles.srcIcon} aria-hidden="true" />
                    <span className={styles.srcBody}>
                      <span className={styles.srcTitleRow}>
                        <span className={styles.srcTitle}>{source.title}</span>
                        <span className={styles.srcNum}>{source.id}</span>
                      </span>
                      <span className={styles.srcLoc}>{source.location}</span>
                      <span className={styles.srcSnippet}>{source.snippet}</span>
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </div>
          <p className={styles.paneNote}>INTERACTIVE DEMONSTRATION · SYNTHETIC DOCUMENTS</p>
        </div>
      </section>

      <div className={styles.brief}>
        <p className={styles.briefText}>Every response is backed by source passages. Citations resolve to the exact page, sheet, or row that produced them.</p>
        <details className={styles.disc}>
          <summary className={styles.discSummary}>See how source-backed answers work</summary>
          <div className={styles.discBody}>
            <p className={styles.answer}>
              Operating margin improved to <mark className={styles.mark}>18.7% on productivity gains and lower operating costs</mark>, while operating expenses decreased 6.3% QoQ, with productivity initiatives delivering $12.4M in annualized savings.
            </p>
            <ul className={styles.miniList}>
              <li><span className={styles.srcNum}>1</span>Q2 Board Deck.pdf · p.7</li>
              <li><span className={styles.srcNum}>2</span>Financials.xlsx · Sheet P&L</li>
              <li><span className={styles.srcNum}>3</span>Management Memo.pdf · p.3</li>
            </ul>
            <p className={styles.paneNote}>INTERACTIVE DEMONSTRATION · SYNTHETIC DOCUMENTS</p>
          </div>
        </details>
      </div>

      <p className={styles.srOnly} role="status">{announce}</p>
    </main>
  );
}
