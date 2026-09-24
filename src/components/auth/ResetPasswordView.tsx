'use client';

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { LockKeyhole } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { updateAccountPassword } from "@/lib/auth/actions";
import { updatePasswordFormSchema, type UpdatePasswordFormValues } from "@/lib/auth/schema";
import styles from "./AuthView.module.css";

type BarState = "idle" | "pending" | "done";

function barClasses(state: BarState) {
  return `${styles.bar} ${state === "pending" ? styles.barPending : ""} ${state === "done" ? styles.barDone : ""}`;
}

export function ResetPasswordView() {
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [bar, setBar] = useState<BarState>("idle");
  const [showPassword, setShowPassword] = useState(false);
  const timersRef = useRef<number[]>([]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<UpdatePasswordFormValues>({
    resolver: zodResolver(updatePasswordFormSchema),
    defaultValues: {
      password: "",
      confirmPassword: "",
    },
  });

  useEffect(() => {
    const timers = timersRef.current;
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, []);

  async function onSubmit(values: UpdatePasswordFormValues) {
    setAuthError(null);
    setIsSubmitting(true);
    setBar("pending");
    try {
      const result = await updateAccountPassword(values);
      if (result.status === "error") {
        setAuthError(result.message);
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

  return (
    <main className={styles.resetMain}>
      <header className={styles.brandRow}>
        <Link href="/" className={styles.brand} aria-label="Pliny home">Pliny</Link>
      </header>
      <div className={styles.formCol}>
        <p className={styles.eyebrow}>ACCOUNT RECOVERY</p>
        <h1 className={styles.title}>Choose a new password</h1>
        <p className={styles.lede}>Pick a new password for your account. You are signed in once the update succeeds.</p>
        <form className={styles.form} onSubmit={handleSubmit(onSubmit)} noValidate>
          <div className={styles.field}>
            <Label htmlFor="new-password" className={styles.label}>New password</Label>
            <span className={`${styles.control} ${showPassword ? styles.show : ""}`}>
              <LockKeyhole className={styles.leadIcon} aria-hidden="true" />
              <Input
                id="new-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="At least 8 characters"
                className={`${styles.input} ${errors.password ? styles.bad : ""}`}
                aria-invalid={errors.password ? "true" : "false"}
                aria-describedby="new-password-msg"
                {...register("password")}
              />
              <button
                type="button"
                className={styles.peek}
                aria-pressed={showPassword}
                aria-label={showPassword ? "Hide passwords" : "Show passwords"}
                onClick={() => setShowPassword((visible) => !visible)}
              >
                {showPassword ? "HIDE" : "SHOW"}
              </button>
            </span>
            <p id="new-password-msg" className={styles.msg} aria-live="polite">{errors.password?.message ?? ""}</p>
          </div>
          <div className={styles.field}>
            <Label htmlFor="confirm-password" className={styles.label}>Confirm new password</Label>
            <span className={styles.control}>
              <LockKeyhole className={styles.leadIcon} aria-hidden="true" />
              <Input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                autoComplete="new-password"
                placeholder="Repeat the new password"
                className={`${styles.input} ${errors.confirmPassword ? styles.bad : ""}`}
                aria-invalid={errors.confirmPassword ? "true" : "false"}
                aria-describedby="confirm-password-msg"
                {...register("confirmPassword")}
              />
            </span>
            <p id="confirm-password-msg" className={styles.msg} aria-live="polite">{errors.confirmPassword?.message ?? ""}</p>
          </div>
          {authError ? (
            <div className={styles.notice} role="alert">
              <span>{authError}</span>
              <Link href="/login" className={styles.noticeRetry}>Back to sign in</Link>
            </div>
          ) : null}
          <button type="submit" className={styles.btn} disabled={isSubmitting}>
            {isSubmitting ? "Please wait" : "Update password"}
          </button>
          <span className={barClasses(bar)} aria-hidden="true"><span className={styles.barFill} /></span>
        </form>
        <div className={styles.foot}>
          <Link href="/login" className={styles.flinkCenter}>Back to sign in</Link>
        </div>
      </div>
    </main>
  );
}
