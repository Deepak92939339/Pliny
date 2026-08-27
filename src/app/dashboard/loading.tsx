export default function DashboardLoading() {
  return (
    <main className="min-h-screen bg-[#FAF7F2] text-[#17202A]">
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <header className="flex flex-wrap items-center justify-between gap-4 border-b border-[#E8E2D9] pb-5">
          <div className="flex items-center gap-3">
            <span className="size-9 animate-pulse rounded-[7px] bg-[#E7DDD0]" />
            <span className="h-4 w-24 animate-pulse rounded bg-[#E7DDD0]" />
          </div>
          <div className="h-9 w-40 animate-pulse rounded-[7px] bg-[#E7DDD0]" />
        </header>

        <section className="mt-10 flex flex-wrap items-end justify-between gap-5">
          <div>
            <div className="h-3 w-48 animate-pulse rounded bg-[#BA5C3D]/20" />
            <div className="mt-5 h-10 w-72 animate-pulse rounded bg-[#E7DDD0]" />
            <div className="mt-4 h-4 w-96 max-w-full animate-pulse rounded bg-[#E7DDD0]" />
          </div>
        </section>

        <section className="mt-10 overflow-hidden rounded-[18px] border border-[#E8E2D9] bg-white shadow-[0_24px_70px_rgba(72,48,31,0.08)]">
          <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 border-b border-[#E8E2D9] bg-[#FBF8F3] px-5 py-3 lg:grid-cols-[minmax(0,1fr)_120px_140px_92px]">
            <span className="h-3 w-24 animate-pulse rounded bg-[#E7DDD0]" />
            <span className="hidden h-3 w-20 animate-pulse rounded bg-[#E7DDD0] lg:block" />
            <span className="hidden h-3 w-20 animate-pulse rounded bg-[#E7DDD0] lg:block" />
            <span className="h-3 w-14 animate-pulse justify-self-end rounded bg-[#E7DDD0]" />
          </div>
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 border-b border-[#E8E2D9] px-5 py-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_120px_140px_92px]">
              <div>
                <div className="h-4 w-48 max-w-full animate-pulse rounded bg-[#E7DDD0]" />
                <div className="mt-2 h-3 w-72 max-w-full animate-pulse rounded bg-[#F3EDE4]" />
              </div>
              <span className="hidden h-3 w-20 animate-pulse rounded bg-[#F3EDE4] lg:block" />
              <span className="hidden h-3 w-24 animate-pulse rounded bg-[#F3EDE4] lg:block" />
              <span className="h-8 w-16 animate-pulse justify-self-end rounded-[7px] bg-[#F3EDE4]" />
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
