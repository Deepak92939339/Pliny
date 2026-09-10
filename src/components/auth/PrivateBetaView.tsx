import Link from "next/link";
import { ArrowRight, LockKeyhole } from "lucide-react";
import { BrandMark } from "@/components/shared/BrandMark";
import { PRIVATE_BETA_SIGNUP_MESSAGE } from "@/lib/auth/privateBeta";

export function PrivateBetaView() {
  return (
    <main className="flex min-h-screen items-center bg-[#FAF7F2] px-6 py-12 text-[#17202A] sm:px-8">
      <section className="mx-auto w-full max-w-[620px] border border-[#D9CBBB] bg-[#FFFEFB] p-8 shadow-[0_24px_70px_rgba(72,48,31,0.10)] sm:p-12" aria-labelledby="private-beta-heading">
        <Link href="/" aria-label="Pliny home" className="inline-flex text-[#17202A] transition-colors hover:text-[#BA5C3D]">
          <BrandMark markClassName="size-10" textClassName="dm-editorial-display text-[26px] font-semibold" />
        </Link>
        <div className="mt-12 inline-flex items-center gap-2 rounded-full border border-[#BA5C3D]/30 bg-[#BA5C3D]/10 px-3 py-1.5 font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-[#8D3F28]">
          <LockKeyhole className="size-3.5" aria-hidden="true" /> Private beta
        </div>
        <h1 id="private-beta-heading" className="dm-editorial-display mt-5 text-[44px] font-semibold leading-[1.02] tracking-[-0.045em] sm:text-[58px]">
          Access is by invitation.
        </h1>
        <p className="mt-5 max-w-[520px] text-[16px] leading-8 text-[#5F6875]">{PRIVATE_BETA_SIGNUP_MESSAGE}</p>
        <p className="mt-3 max-w-[520px] text-[14px] leading-7 text-[#6B7280]">
          If an administrator has already created your account, use the confirmed email and password they provided.
        </p>
        <div className="mt-9 flex flex-wrap items-center gap-5 border-t border-[#E8E2D9] pt-7">
          <Link href="/login" className="inline-flex h-11 items-center gap-2 rounded-[7px] bg-[#BA5C3D] px-5 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.16)] hover:bg-[#A8421F] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25">
            Sign in <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#596170] underline-offset-4 hover:text-[#8D3F28] hover:underline">
            Back to Pliny
          </Link>
        </div>
      </section>
    </main>
  );
}
