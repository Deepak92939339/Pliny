import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";

export default function CollectionNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-[color:var(--paper-0)] px-6 text-[color:var(--ink-900)]">
      <section className="w-full max-w-md rounded-lg border border-[color:var(--rule-strong)] bg-[color:var(--paper-1)] p-6 text-center shadow-2xl shadow-black/10">
        <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-[color:var(--rule)] bg-[color:var(--paper-2)]">
          <SearchX className="size-5 text-[color:var(--ink-500)]" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-[color:var(--ink-900)]">Workspace not found</h1>
        <p className="mt-3 text-sm leading-6 text-[color:var(--ink-500)]">This workspace does not exist or is not available to your account.</p>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          <ArrowLeft aria-hidden="true" />
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
