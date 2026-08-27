import Link from "next/link";
import { ArrowLeft, SearchX } from "lucide-react";
import { buttonVariants } from "@/components/ui/Button";

export default function CollectionNotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-950 px-6 text-zinc-100">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-zinc-900/75 p-6 text-center shadow-2xl shadow-black/35">
        <div className="mx-auto flex size-11 items-center justify-center rounded-lg border border-white/10 bg-zinc-950/45">
          <SearchX className="size-5 text-zinc-400" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-xl font-semibold text-zinc-50">Workspace not found</h1>
        <p className="mt-3 text-sm leading-6 text-zinc-400">This workspace does not exist or is not available to your account.</p>
        <Link href="/dashboard" className={buttonVariants({ variant: "outline", className: "mt-6" })}>
          <ArrowLeft aria-hidden="true" />
          Back to dashboard
        </Link>
      </section>
    </main>
  );
}
