"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { ArrowRight, CheckCircle2, FileText, LockKeyhole, Mail, SearchCheck, ShieldCheck } from "lucide-react";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/label";
import { loginWithPassword, signupWithPassword } from "@/lib/auth/actions";
import { authFormSchema, type AuthFormValues } from "@/lib/auth/schema";

type AuthViewProps = {
  mode: "login" | "signup";
};

const previewSources = [
  {
    excerpt: "Operating margin improved to 18.7%, driven by lower operating costs and productivity work.",
    location: "p.7",
    title: "Q2 Board Deck.pdf",
  },
  {
    excerpt: "The P&L shows operating expenses decreased 6.3% QoQ.",
    location: "Sheet: P&L",
    title: "Financials.xlsx",
  },
  {
    excerpt: "Productivity initiatives delivered $12.4M in annualized savings.",
    location: "p.3",
    title: "Management Memo.pdf",
  },
];

const previewTakeaways = [
  "Every answer is tied to a source passage.",
  "Spreadsheet rows and documents stay in one private workspace.",
  "Citations remain visible before you rely on the answer.",
];

export function AuthView({ mode }: AuthViewProps) {
  const isSignup = mode === "signup";
  const router = useRouter();
  const [authError, setAuthError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<AuthFormValues>({
    resolver: zodResolver(authFormSchema),
    defaultValues: {
      name: "",
      email: "",
      password: "",
    },
  });

  async function onSubmit(values: AuthFormValues) {
    setAuthError(null);
    setSuccessMessage(null);
    setIsSubmitting(true);

    try {
      const result = isSignup ? await signupWithPassword(values) : await loginWithPassword(values);

      if (result.status === "error") {
        setAuthError(result.message);
        return;
      }

      if (isSignup) {
        reset({
          name: "",
          email: "",
          password: "",
        });
        setSuccessMessage(result.message ?? "Check your email");
        return;
      }

      router.push("/dashboard");
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#FAF7F2] text-[#17202A]">
      <div className="grid min-h-screen grid-cols-1 lg:grid-cols-[minmax(380px,44%)_minmax(0,56%)] xl:grid-cols-[minmax(420px,42%)_minmax(0,58%)]">
        <section className="flex min-h-screen flex-col px-6 py-6 sm:px-8 lg:px-12 xl:px-16">
          <header className="flex h-12 items-center justify-between">
            <Link href="/" aria-label="Vector home" className="text-[#17202A] transition-colors hover:text-[#BA5C3D]">
              <AuthLogo />
            </Link>
            <Link href={isSignup ? "/login" : "/signup"} className="text-[13px] font-medium tracking-[-0.01em] text-[#5F6875] transition-colors hover:text-[#BA5C3D]">
              {isSignup ? "Sign in" : "Create account"}
            </Link>
          </header>

          <div className="mx-auto flex w-full max-w-[440px] flex-1 flex-col justify-center py-10">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-[#BA5C3D]">{isSignup ? "Start your workspace" : "Secure access"}</p>
              <h1 className="dm-editorial-display mt-4 text-[42px] font-semibold leading-[1.02] tracking-[-0.04em] text-[#17202A] sm:text-[48px]">
                {isSignup ? "Create your workspace" : "Sign in to your workspace"}
              </h1>
              <p className="mt-4 text-[15px] leading-7 text-[#5F6875]">
                {isSignup
                  ? "Create a private workspace for documents, spreadsheets, and source-cited answers."
                  : "Access your documents and their answers. Every response is backed by source passages."}
              </p>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="mt-9 space-y-5">
              {isSignup ? (
                <div className="space-y-2">
                  <Label htmlFor="name" className="text-[13px] font-semibold text-[#17202A]">
                    Name
                  </Label>
                  <Input
                    id="name"
                    placeholder="Avery Stone"
                    type="text"
                    autoComplete="name"
                    className="h-11 rounded-[7px] border-[#D9CBBB] bg-white text-[#17202A] shadow-sm shadow-[rgba(72,48,31,0.04)] placeholder:text-[#8A7D70] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20"
                    {...register("name")}
                  />
                  {errors.name ? <p className="text-sm text-[#A13F2A]">{errors.name.message}</p> : null}
                </div>
              ) : null}

              <div className="space-y-2">
                <Label htmlFor="email" className="text-[13px] font-semibold text-[#17202A]">
                  Email
                </Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8A7D70]" aria-hidden="true" />
                  <Input
                    id="email"
                    placeholder="name@company.com"
                    type="email"
                    autoComplete="email"
                    className="h-11 rounded-[7px] border-[#D9CBBB] bg-white pl-10 text-[#17202A] shadow-sm shadow-[rgba(72,48,31,0.04)] placeholder:text-[#8A7D70] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20"
                    aria-invalid={errors.email ? "true" : "false"}
                    {...register("email")}
                  />
                </div>
                {errors.email ? <p className="text-sm text-[#A13F2A]">{errors.email.message}</p> : null}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-[13px] font-semibold text-[#17202A]">
                  Password
                </Label>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[#8A7D70]" aria-hidden="true" />
                  <Input
                    id="password"
                    placeholder="Enter your password"
                    type="password"
                    autoComplete={isSignup ? "new-password" : "current-password"}
                    className="h-11 rounded-[7px] border-[#D9CBBB] bg-white pl-10 text-[#17202A] shadow-sm shadow-[rgba(72,48,31,0.04)] placeholder:text-[#8A7D70] focus-visible:border-[#BA5C3D] focus-visible:ring-[#BA5C3D]/20"
                    aria-invalid={errors.password ? "true" : "false"}
                    {...register("password")}
                  />
                </div>
                {errors.password ? <p className="text-sm text-[#A13F2A]">{errors.password.message}</p> : null}
              </div>

              {authError ? (
                <div className="rounded-[7px] border border-[#BA5C3D]/25 bg-[#BA5C3D]/10 px-3 py-2 text-sm text-[#A13F2A]" role="alert">
                  {authError}
                </div>
              ) : null}

              {successMessage ? (
                <div className="rounded-[7px] border border-[#BA5C3D]/25 bg-[#BA5C3D]/10 px-3 py-2 text-sm text-[#8D3F28]" role="status">
                  {successMessage}
                </div>
              ) : null}

              <button
                className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-[7px] bg-[#BA5C3D] px-4 text-sm font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.16)] outline-none transition-[background-color,transform] hover:bg-[#A8421F] active:scale-[0.98] disabled:pointer-events-none disabled:opacity-55 focus-visible:ring-3 focus-visible:ring-[#BA5C3D]/25"
                type="submit"
                disabled={isSubmitting}
              >
                {isSubmitting ? "Please wait" : isSignup ? "Create account" : "Sign in"}
                <ArrowRight className="size-4" aria-hidden="true" />
              </button>
            </form>

            <div className="mt-8 border-t border-[#E8E2D9] pt-6">
              <p className="text-center text-sm text-[#6B7280]">
                {isSignup ? "Already have an account?" : "Don’t have an account?"}{" "}
                <Link href={isSignup ? "/login" : "/signup"} className="font-semibold text-[#BA5C3D] underline-offset-4 hover:underline">
                  {isSignup ? "Sign in" : "Create one"}
                </Link>
              </p>
              <div className="mt-6 flex items-start gap-3 text-[#6B7280]">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#BA5C3D]" aria-hidden="true" />
                <p className="text-xs leading-5">Your documents stay private. Every answer shows exactly where it came from.</p>
              </div>
            </div>
          </div>
        </section>

        <AuthPreviewPanel />
      </div>
    </main>
  );
}

function AuthLogo() {
  return (
    <span className="flex h-9 items-center gap-[7px]">
      <svg className="size-6 shrink-0 text-[#BA5C3D]" viewBox="0 0 32 32" aria-hidden="true" fill="none">
        <path
          d="M16 3.8 25 7.2v7.2c0 6.1-3.8 10.8-9 13.6-5.2-2.8-9-7.5-9-13.6V7.2L16 3.8Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path
          d="M11.2 11.2h5.2c2.5 0 4.4 1.5 4.4 3.7v5.1h-5.2c-2.5 0-4.4-1.5-4.4-3.7v-5.1Z"
          stroke="currentColor"
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
        <path d="m13.2 15.5 2 2 4.1-4.3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="dm-editorial-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#17202A]">Vector</span>
    </span>
  );
}

function AuthPreviewPanel() {
  return (
    <aside className="relative hidden min-h-screen overflow-hidden border-l border-[#E8E2D9] bg-[#F3EDE4] lg:block">
      <Image
        src="/images/pliny-hero-etching.png"
        alt=""
        aria-hidden="true"
        width={1448}
        height={1086}
        className="pointer-events-none absolute right-[-140px] top-[-60px] w-[520px] object-contain opacity-[0.10] mix-blend-multiply"
      />
      <div className="relative flex min-h-screen items-center justify-center px-10 py-14">
        <div className="w-full max-w-[620px]">
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BA5C3D]">Source-backed answers</p>
            <h2 className="dm-editorial-display mt-3 text-[34px] font-semibold leading-tight tracking-[-0.035em] text-[#17202A]">
              Review documents with the source beside you.
            </h2>
          </div>

          <div className="rounded-[20px] border border-[#E1D8CB] bg-white p-4 shadow-[0_24px_60px_rgba(72,48,31,0.10)]">
            <div className="rounded-[16px] border border-[#E8E2D9] bg-[#FFFEFB]">
              <header className="flex items-center justify-between border-b border-[#E8E2D9] px-5 py-4">
                <div>
                  <h3 className="text-[15px] font-semibold text-[#17202A]">Q2 Board Pack</h3>
                  <p className="mt-0.5 text-[12px] text-[#6B7280]">12 documents</p>
                </div>
                <span className="rounded-full border border-[#D9CBBB] bg-[#F3EDE4] px-3 py-1 text-[11px] font-semibold text-[#8A7D70]">3 citations</span>
              </header>

              <div className="grid gap-0 xl:grid-cols-[minmax(0,1fr)_230px]">
                <div className="p-5">
                  <div className="inline-flex rounded-[9px] border border-[#D9CBBB] bg-[#EFE5D8] px-4 py-3 text-[12px] font-medium text-[#17202A] shadow-[0_14px_34px_rgba(72,48,31,0.08)]">
                    What changed operating margin in Q2?
                  </div>

                  <div className="mt-6">
                    <div className="flex items-center gap-2">
                      <FileText className="size-4 text-[#BA5C3D]" aria-hidden="true" />
                      <h4 className="text-sm font-semibold text-[#17202A]">Answer</h4>
                    </div>
                    <p className="mt-3 text-[13px] leading-6 text-[#4B5563]">
                      Operating margin improved to 18.7%, driven by productivity gains and lower operating costs, partially offset by SG&A growth.
                    </p>
                  </div>

                  <div className="mt-5 rounded-[12px] border border-[#E8E2D9] bg-white p-4">
                    <div className="flex items-end justify-between">
                      <div>
                        <p className="text-[12px] font-semibold text-[#17202A]">Operating Margin</p>
                        <p className="mt-1 text-[11px] text-[#6B7280]">Quarterly trend</p>
                      </div>
                      <span className="text-sm font-semibold text-[#BA5C3D]">18.7%</span>
                    </div>
                    <svg className="mt-3 h-20 w-full" viewBox="0 0 260 86" fill="none" aria-hidden="true">
                      <path d="M8 68H252M8 46H252M8 24H252" stroke="#E8E2D9" strokeWidth="1" />
                      <path d="M12 58L70 42L128 49L186 48L244 34" stroke="#BA5C3D" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                      {[12, 70, 128, 186, 244].map((cx) => (
                        <circle key={cx} cx={cx} cy={cx === 244 ? 34 : cx === 70 ? 42 : cx === 12 ? 58 : cx === 128 ? 49 : 48} r="3" fill="#BA5C3D" stroke="#FFFFFF" strokeWidth="2" />
                      ))}
                    </svg>
                  </div>

                  <ul className="mt-5 space-y-2">
                    {previewTakeaways.map((takeaway) => (
                      <li key={takeaway} className="flex items-start gap-2 text-[12px] leading-5 text-[#4B5563]">
                        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#BA5C3D]" aria-hidden="true" />
                        <span>{takeaway}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="border-t border-[#E8E2D9] bg-[#FBF8F3] p-4 xl:border-l xl:border-t-0">
                  <div className="mb-4 flex items-center gap-2">
                    <SearchCheck className="size-4 text-[#BA5C3D]" aria-hidden="true" />
                    <h4 className="text-sm font-semibold text-[#17202A]">Sources</h4>
                  </div>
                  <div className="space-y-3">
                    {previewSources.map((source, index) => (
                      <MiniSourceCard key={source.title} index={index + 1} source={source} />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function MiniSourceCard({ index, source }: { index: number; source: (typeof previewSources)[number] }) {
  return (
    <article className="rounded-[10px] border border-[#E8E2D9] bg-white p-3">
      <div className="flex items-start gap-2">
        <FileText className="mt-0.5 size-4 shrink-0 text-[#BA5C3D]" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-[12px] font-semibold text-[#17202A]">{source.title}</p>
            <span className="ml-auto shrink-0 rounded border border-[#BA5C3D]/25 bg-[#BA5C3D]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#BA5C3D]">{index}</span>
          </div>
          <p className="mt-0.5 text-[11px] text-[#6B7280]">{source.location}</p>
          <p className="mt-2 line-clamp-2 text-[11px] leading-5 text-[#5F6875]">{source.excerpt}</p>
        </div>
      </div>
    </article>
  );
}
