function SkeletonBlock({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-black/[0.08] dark:bg-white/[0.08] ${className}`} />;
}

export default function CollectionLoading() {
  return (
    <main className="dm-page flex h-screen w-screen overflow-hidden text-[color:var(--editorial-ink)]">
      <aside className="hidden h-full min-h-0 w-[260px] shrink-0 flex-col border-r border-black/[0.08] bg-[#F7F7F5] dark:border-white/[0.06] dark:bg-[#0A0A0F] md:flex">
        <div className="shrink-0 px-4 py-4">
          <SkeletonBlock className="h-8 w-36" />
          <SkeletonBlock className="mt-4 h-9 w-full rounded-lg" />
        </div>
        <div className="min-h-0 flex-1 px-4 py-3">
          <SkeletonBlock className="h-3 w-24" />
          <div className="mt-3 space-y-2">
            <SkeletonBlock className="h-8 w-full" />
            <SkeletonBlock className="h-8 w-11/12" />
            <SkeletonBlock className="h-8 w-4/5" />
          </div>
          <SkeletonBlock className="mt-8 h-3 w-16" />
          <div className="mt-3 space-y-3">
            <SkeletonBlock className="h-9 w-full" />
            <SkeletonBlock className="h-9 w-5/6" />
          </div>
        </div>
      </aside>

      <section className="flex h-screen min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-12 shrink-0 items-center justify-between border-b border-black/[0.08] bg-[#F7F7F5]/90 px-4 dark:border-white/[0.06] dark:bg-[#0A0A0F]/90">
          <div>
            <SkeletonBlock className="h-4 w-44" />
            <SkeletonBlock className="mt-1.5 h-3 w-20" />
          </div>
          <div className="flex items-center gap-3">
            <SkeletonBlock className="h-8 w-14 rounded-full" />
            <SkeletonBlock className="size-8 rounded-full" />
          </div>
        </header>

        <div className="flex min-h-0 flex-1 overflow-hidden">
          <section className="flex min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-hidden px-4 py-8 md:px-8">
              <div className="mx-auto max-w-[820px] space-y-8">
                <div className="flex justify-end">
                  <SkeletonBlock className="h-12 w-[58%] rounded-2xl" />
                </div>
                <div className="space-y-3">
                  <SkeletonBlock className="h-4 w-full" />
                  <SkeletonBlock className="h-4 w-11/12" />
                  <SkeletonBlock className="h-4 w-3/4" />
                </div>
              </div>
            </div>
            <div className="shrink-0 px-4 pb-6 md:px-8">
              <SkeletonBlock className="mx-auto h-24 max-w-[720px] rounded-3xl" />
            </div>
          </section>

          <aside className="hidden h-full min-h-0 w-[280px] shrink-0 flex-col border-l border-black/[0.08] bg-[#F7F7F5]/70 dark:border-white/[0.06] dark:bg-[#0A0A0F]/70 lg:flex">
            <div className="flex h-12 shrink-0 items-center gap-2 border-b border-black/[0.08] px-3 dark:border-white/[0.06]">
              <SkeletonBlock className="h-4 w-24" />
              <SkeletonBlock className="ml-auto size-7 rounded-md" />
            </div>
            <div className="border-b border-black/[0.08] p-3 dark:border-white/[0.06]">
              <SkeletonBlock className="h-20 w-full rounded-xl" />
            </div>
            <div className="space-y-2 p-3">
              <SkeletonBlock className="h-10 w-full" />
              <SkeletonBlock className="h-10 w-11/12" />
              <SkeletonBlock className="h-10 w-4/5" />
            </div>
          </aside>
        </div>
      </section>
    </main>
  );
}
