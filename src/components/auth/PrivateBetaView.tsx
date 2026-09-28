import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { PRIVATE_BETA_SIGNUP_MESSAGE } from "@/lib/auth/privateBeta";

export function PrivateBetaView() {
  return (
    <main className="flex min-h-screen items-center bg-[var(--paper-0)] px-6 py-12 text-[var(--ink-900)] sm:px-8">
      <section className="mx-auto w-full max-w-[620px] border border-[var(--rule-strong)] bg-[var(--paper-1)] p-8 shadow-[0_24px_70px_rgba(72,48,31,0.10)] sm:p-12" aria-labelledby="private-beta-heading">
        <Link href="/" aria-label="Pliny home" className="inline-flex text-[var(--ink-900)] transition-colors hover:text-[var(--accent)]">
          <BrandMark markClassName="size-10" textClassName="dm-editorial-display text-[26px] font-semibold" />
        </Link>
        <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/30 bg-[var(--accent)]/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--accent-ink)]">
          <LockKeyhole className="size-3.5" aria-hidden="true" /> Private beta
        </div>
        <h1 id="private-beta-heading" className="dm-editorial-display mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[58px]">
          Access is by invitation.
        </h1>
        <p className="mt-5 max-w-[520px] text-[16px] leading-8 text-[var(--ink-500)]">{PRIVATE_BETA_SIGNUP_MESSAGE}</p>
        <p className="mt-3 max-w-[520px] text-[14px] leading-7 text-[var(--ink-500)]">
          If an administrator has already created your account, use the confirmed email and password they provided.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-5 border-t border-[var(--rule)] pt-7">
          <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[var(--accent)] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.16)] hover:bg-[var(--accent-ink)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[var(--accent)]/25">
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[color:var(--ink-500)] underline-offset-4 hover:text-[var(--accent-ink)] hover:underline">
            Back to Pliny
          </Link>
        </div>
      </section>
    </main>
  );
}
