'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { FormEvent as ReactFormEvent, KeyboardEvent as ReactKeyboardEvent } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { CheckCircle2, FileText, LockKeyhole, Mail, SearchCheck, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { loginWithPassword } from "@/lib/auth/actions";
import { authFormSchema, type AuthFormValues } from "@/lib/auth/schema";
import styles from "./AuthView.module.css";

type View = "signin" | "recovery" | "beta";
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

export function AuthView() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bar, setBar] = useState<BarState>("idle");
  const [view, setView] = useState<View>("signin");
  const [announce, setAnnounce] = useState("");
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [selCite, setSelCite] = useState<number | null>(null);
  const [hoverCite, setHoverCite] = useState<number | null>(null);
  const [recoveryEmail, setRecoveryEmail] = useState("");
  const [recoveryBar, setRecoveryBar] = useState<BarState>("idle");
  const [recoverySent, setRecoverySent] = useState(false);
  const [betaBar, setBetaBar] = useState<BarState>("idle");
  const [betaSent, setBetaSent] = useState(false);

  const forgotRef = useRef<HTMLButtonElement>(null);
  const requestRef = useRef<HTMLButtonElement>(null);
  const pendingFocusRef = useRef<"forgot" | "request" | null>(null);
  const timersRef = useRef<number[]>([]);

  const {
    register,
    handleSubmit,
    getValues,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  useEffect(() => {
    if (!pendingFocusRef.current) return;
    const target = pendingFocusRef.current === "forgot" ? forgotRef.current : requestRef.current;
    pendingFocusRef.current = null;
    target?.focus();
  });

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

  async function onSubmit(values: AuthFormValues) {
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
      setBar("done");
      timersRef.current.push(window.setTimeout(() => setBar("idle"), 480));
    }
  }

  function retry() {
    document.getElementById("email")?.focus();
    void handleSubmit(onSubmit)();
  }

  function onCapsCheck(event: ReactKeyboardEvent<HTMLInputElement>) {
    setCapsLock(event.getModifierState("CapsLock"));
  }

  function openRecovery() {
    setRecoveryEmail(getValues("email"));
    setRecoverySent(false);
    setRecoveryBar("idle");
    setView("recovery");
    setAnnounce("Account recovery view opened.");
  }

  function openBeta() {
    setBetaSent(false);
    setBetaBar("idle");
    setView("beta");
    setAnnounce("Request access view opened.");
  }

  function backToSignIn(from: "recovery" | "beta") {
    pendingFocusRef.current = from === "recovery" ? "forgot" : "request";
    setView("signin");
    setAnnounce("Returned to sign in.");
  }

  function onRecoverySubmit(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRecoveryBar("pending");
    timersRef.current.push(
      window.setTimeout(() => {
        setRecoveryBar("done");
        setRecoverySent(true);
        setAnnounce("Recovery confirmation shown. No email is sent in this release.");
        timersRef.current.push(window.setTimeout(() => setRecoveryBar("idle"), 480));
      }, 900),
    );
  }

  function onBetaSubmit(event: ReactFormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBetaBar("pending");
    timersRef.current.push(
      window.setTimeout(() => {
        setBetaBar("done");
        setBetaSent(true);
        setAnnounce("Request received confirmation shown. Requests are not collected online.");
        timersRef.current.push(window.setTimeout(() => setBetaBar("idle"), 480));
      }, 900),
    );
  }

  function toggleCite(id: number) {
    const next = selCite === id ? null : id;
    setSelCite(next);
    setAnnounce(next === null ? "Citation deselected." : `Citation ${next} selected; matching evidence highlighted.`);
  }

  function barClasses(state: BarState) {
    return `${styles.bar} ${state === "pending" ? styles.barPending : ""} ${state === "done" ? styles.barDone : ""}`;
  }

  return (
    <main className={styles.shell}>
      <a className={styles.skip} href="#signin-form">Skip to sign-in form</a>

      <section className={styles.paneForm} aria-label="Sign in">
        <header className={styles.brandRow}>
          <Link href="/" className={styles.brand} aria-label="Pliny home">Pliny</Link>
          <span className={styles.betaTag}>PRIVATE BETA</span>
        </header>

        <div className={styles.formCol}>
          {view === "signin" ? (
            <div className={styles.view}>
              <div className={styles.statusSlot}>
                {authError ? (
                  <div className={styles.notice} role="alert">
                    <span>{authError}</span>
                    <button type="button" className={styles.noticeRetry} onClick={retry}>Retry</button>
                  </div>
                ) : null}
              </div>
              <p className={styles.eyebrow}>SECURE ACCESS</p>
              <h1 className={styles.title}>Sign in to your workspace</h1>
              <p className={styles.lede}>Access your documents and their answers. Every response is backed by source passages.</p>

              <form id="signin-form" className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
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
                    <button ref={forgotRef} type="button" className={styles.flink} onClick={openRecovery}>Forgot password?</button>
                  </span>
                  <span className={`${styles.control} ${showPassword ? styles.show : ""}`}>
                    <LockKeyhole className={styles.leadIcon} aria-hidden="true" />
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
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
                  {isSubmitting ? "Please wait" : "Sign in"}
                </button>
                <span className={barClasses(bar)} aria-hidden="true"><span className={styles.barFill} /></span>
              </form>

              <div className={styles.foot}>
                <p className={styles.betaNote}>Pliny is a private beta. Accounts are created and confirmed by an administrator.</p>
                <button ref={requestRef} type="button" className={styles.flinkCenter} onClick={openBeta}>Request access</button>
                <p className={styles.privacy}>
                  <ShieldCheck className={styles.privacyIcon} aria-hidden="true" />
                  Your documents stay private. Every answer shows exactly where it came from.
                </p>
              </div>
            </div>
          ) : null}

          {view === "recovery" ? (
            <div className={styles.view}>
              <button type="button" className={styles.backLink} onClick={() => backToSignIn("recovery")}>← Back to sign in</button>
              <p className={styles.eyebrow}>ACCOUNT RECOVERY</p>
              <h1 className={styles.title}>Reset your password</h1>
              <p className={styles.lede}>Enter the email you use for Pliny and we&apos;ll explain the next step.</p>
              {recoverySent ? (
                <div className={styles.confirm} role="status">
                  <h2 className={styles.confirmTitle}>Check your inbox</h2>
                  <p className={styles.confirmBody}>If an account exists for this email, recovery instructions will be sent. The link expires 30 minutes after issue.</p>
                  <p className={styles.monoNote}>INTERFACE SPECIFICATION · RECOVERY DELIVERY IS NOT WIRED IN THIS RELEASE · NO EMAIL IS SENT</p>
                </div>
              ) : (
                <form className={styles.form} onSubmit={onRecoverySubmit} noValidate>
                  <div className={styles.field}>
                    <Label htmlFor="recovery-email" className={styles.label}>Email</Label>
                    <span className={styles.control}>
                      <Mail className={styles.leadIcon} aria-hidden="true" />
                      <Input
                        id="recovery-email"
                        type="email"
                        autoComplete="email"
                        required
                        placeholder="name@company.com"
                        className={styles.input}
                        value={recoveryEmail}
                        onChange={(event) => setRecoveryEmail(event.target.value)}
                      />
                    </span>
                  </div>
                  <button type="submit" className={styles.btn} disabled={recoveryBar === "pending"}>Send recovery instructions</button>
                  <span className={barClasses(recoveryBar)} aria-hidden="true"><span className={styles.barFill} /></span>
                </form>
              )}
              <button type="button" className={styles.ghost} onClick={() => backToSignIn("recovery")}>Back to sign in</button>
            </div>
          ) : null}

          {view === "beta" ? (
            <div className={styles.view}>
              <button type="button" className={styles.backLink} onClick={() => backToSignIn("beta")}>← Back to sign in</button>
              <p className={styles.eyebrow}>PRIVATE BETA</p>
              <h1 className={styles.title}>Request access</h1>
              <p className={styles.lede}>Pliny workspaces are currently created and approved by an administrator. Share only what is needed to review your request.</p>
              {betaSent ? (
                <div className={styles.confirm} role="status">
                  <h2 className={styles.confirmTitle}>Request received</h2>
                  <p className={styles.confirmBody}>An administrator reviews private-beta requests periodically. If a workspace is created for you, confirmation will be sent to this email.</p>
                  <p className={styles.monoNote}>REQUESTS ARE NOT COLLECTED ONLINE DURING THE PRIVATE BETA · PROVISIONING IS MANUAL BY YOUR ADMINISTRATOR</p>
                </div>
              ) : (
                <form className={styles.form} onSubmit={onBetaSubmit} noValidate>
                  <div className={styles.field}>
                    <Label htmlFor="beta-name" className={styles.label}>Name</Label>
                    <span className={styles.control}>
                      <Input id="beta-name" type="text" autoComplete="name" required placeholder="Your name" className={styles.input} />
                    </span>
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="beta-email" className={styles.label}>Work email</Label>
                    <span className={styles.control}>
                      <Mail className={styles.leadIcon} aria-hidden="true" />
                      <Input id="beta-email" type="email" autoComplete="email" required placeholder="name@company.com" className={styles.input} />
                    </span>
                  </div>
                  <div className={styles.field}>
                    <Label htmlFor="beta-use" className={styles.label}>Intended use (optional)</Label>
                    <textarea id="beta-use" className={styles.textarea} maxLength={200} placeholder="What would you review with Pliny?" />
                    <p className={styles.helpLine}>Kept short on purpose — this is not a sales form.</p>
                  </div>
                  <button type="submit" className={styles.btn} disabled={betaBar === "pending"}>Request access</button>
                  <span className={barClasses(betaBar)} aria-hidden="true"><span className={styles.barFill} /></span>
                </form>
              )}
              <button type="button" className={styles.ghost} onClick={() => backToSignIn("beta")}>Back to sign in</button>
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
                        data-inline-citation
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
                    <g stroke="var(--rule)" strokeWidth="1">
                      <path d="M44 18H540" />
                      <path d="M44 40H540" />
                      <path d="M44 62H540" />
                      <path d="M44 84H540" />
                      <path d="M44 106H540" />
                    </g>
                    <g fill="var(--ink-500)" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="end">
                      <text x="36" y="21">24%</text>
                      <text x="36" y="43">20%</text>
                      <text x="36" y="65">16%</text>
                      <text x="36" y="87">12%</text>
                      <text x="36" y="109">8%</text>
                    </g>
                    <path d="M60 81.8L170 67L280 74.1L390 77.4L500 47.2" stroke="var(--accent-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {CHART_POINTS.map((point, index) => (
                      <g key={point.label} className={`${styles.pt} ${selCite !== null && point.cites.split(" ").includes(String(selCite)) ? styles.sel : ""}`} data-cite={point.cites}>
                        <circle
                          cx={point.x}
                          cy={point.y}
                          r="3.2"
                          fill={index === CHART_POINTS.length - 1 ? "var(--accent-ink)" : "var(--paper-1)"}
                          stroke="var(--accent-ink)"
                          strokeWidth="1.6"
                        />
                        <text x={point.x} y={point.y - 8} textAnchor="middle" fontSize="10" fill="var(--ink-500)" fontFamily="var(--font-jetbrains-mono), monospace">
                          {point.label}
                        </text>
                      </g>
                    ))}
                    <g fill="var(--ink-500)" fontSize="10" fontFamily="var(--font-jetbrains-mono), monospace" textAnchor="middle">
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
            <p className={styles.monoNote}>INTERACTIVE DEMONSTRATION · SYNTHETIC DOCUMENTS</p>
          </div>
        </details>
      </div>

      <p className={styles.srOnly} role="status">{announce}</p>
    </main>
  );
}
