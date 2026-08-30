import Image from "next/image";
import Link from "next/link";
import { ThemeToggle } from "@/components/shared/ThemeToggle";
import { NewWorkspaceDialog } from "@/components/dashboard/NewWorkspaceDialog";
import { logout } from "@/lib/auth/actions";
import type { CollectionListItem } from "@/types";

type DashboardViewProps = {
  userEmail?: string | null;
  collections: CollectionListItem[];
  collectionsError?: string | null;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function getDocumentCountLabel(count: number) {
  return `${count} ${count === 1 ? "document" : "documents"}`;
}

function toWorkspaceCopy(message: string) {
  return message.replaceAll("Project", "Workspace").replaceAll("project", "workspace");
}

function DashboardLogo() {
  return (
    <span className="flex h-9 items-center gap-[7px]">
      <Image src="/brand/pliny-mark.png" alt="" aria-hidden="true" width={1024} height={1024} className="size-6 shrink-0 object-contain" />
      <span className="dm-editorial-display text-[24px] font-semibold leading-none tracking-[-0.02em] text-[#17202A]">Pliny</span>
    </span>
  );
}

export function DashboardView({ userEmail, collections, collectionsError }: DashboardViewProps) {
  return (
    <main className="flex h-screen w-screen overflow-hidden bg-[#FAF7F2] text-[#17202A]">
      <aside className="hidden w-[272px] shrink-0 flex-col border-r border-[#E1D8CB] bg-[#F3EDE4] md:flex">
        <div className="shrink-0 px-4 pb-4 pt-4">
          <Link href="/dashboard" aria-label="Pliny dashboard" className="inline-flex rounded-md text-[#17202A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35">
            <DashboardLogo />
          </Link>

          <NewWorkspaceDialog
            tone="paper"
            size="default"
            variant="outline"
            className="mt-5 h-9 w-full justify-start rounded-[7px] border-[#D9CBBB] bg-[#ECE3D7] px-3 text-sm font-semibold text-[#17202A] shadow-none hover:border-[#BA5C3D]/35 hover:bg-[#E7DDD0]"
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-4">
          <section className="mt-4">
            <h2 className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70]">Workspaces</h2>
            {collections.length === 0 ? (
              <p className="px-3 py-2 text-xs leading-5 text-[#6B7280]">No workspaces yet</p>
            ) : (
              <div className="space-y-1">
                {collections.map((collection) => (
                  <Link
                    key={collection.id}
                    href={`/collection/${collection.id}`}
                    className="block truncate rounded-[7px] border border-transparent px-3 py-2 text-[13px] font-medium text-[#5F6875] transition-colors hover:border-[#D9CBBB] hover:bg-[#E7DDD0] hover:text-[#17202A] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
                    title={collection.name}
                  >
                    {collection.name}
                  </Link>
                ))}
              </div>
            )}
          </section>
        </div>

        <div className="shrink-0 border-t border-[#DDD2C4] px-4 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="min-w-0 truncate text-xs text-[#6B7280]" title={userEmail ?? undefined}>
              {userEmail ?? "Signed in"}
            </p>
            <ThemeToggle tone="editorial" />
          </div>
          <form action={logout}>
            <button
              type="submit"
              className="text-xs font-semibold text-[#8A7D70] hover:text-[#BA5C3D] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#BA5C3D]/35"
            >
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex min-h-full w-full max-w-[1120px] flex-col px-8 py-10 md:px-12 md:py-14">
          <header className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#BA5C3D]">Private document intelligence</p>
              <h1 className="dm-editorial-display mt-3 text-[42px] font-semibold leading-none tracking-[-0.04em] text-[#17202A]">Your workspaces</h1>
              <p className="mt-4 max-w-2xl text-[15px] leading-7 text-[#6B7280]">
                Create a workspace, upload documents, and ask questions with source-backed answers.
              </p>
            </div>
            <NewWorkspaceDialog
              tone="paper"
              size="default"
              className="rounded-[7px] border-[#BA5C3D] bg-[#BA5C3D] px-4 font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.16)] hover:border-[#A8421F] hover:bg-[#A8421F]"
            />
          </header>

          <section className="mt-10 overflow-hidden rounded-[18px] border border-[#E8E2D9] bg-white shadow-[0_24px_70px_rgba(72,48,31,0.08)]">
            <div className="grid grid-cols-[minmax(0,1fr)_72px] gap-3 border-b border-[#E8E2D9] bg-[#FBF8F3] px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#8A7D70] lg:grid-cols-[minmax(0,1fr)_120px_140px_92px] lg:gap-4 lg:px-5">
              <span>Workspace</span>
              <span className="hidden lg:block">Documents</span>
              <span className="hidden lg:block">Updated</span>
              <span className="text-right">Action</span>
            </div>

            {collectionsError ? (
              <div className="px-5 py-8 text-sm leading-6 text-[#A13F2A]">{toWorkspaceCopy(collectionsError)}</div>
            ) : null}

            {!collectionsError && collections.length === 0 ? (
              <div className="px-5 py-16 text-center">
                <h2 className="dm-editorial-display text-[30px] font-semibold tracking-[-0.035em] text-[#17202A]">Create your first workspace</h2>
                <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[#6B7280]">
                  Upload documents, ask questions, and verify every answer against cited source passages.
                </p>
                <div className="mt-6 flex justify-center">
                  <NewWorkspaceDialog
                    tone="paper"
                    label="Create your first workspace"
                    size="default"
                    className="rounded-[7px] border-[#BA5C3D] bg-[#BA5C3D] px-4 font-semibold text-white shadow-[0_12px_24px_rgba(186,92,61,0.16)] hover:border-[#A8421F] hover:bg-[#A8421F]"
                  />
                </div>
              </div>
            ) : null}

            {!collectionsError && collections.length > 0 ? (
              <div className="divide-y divide-[#E8E2D9]">
                {collections.map((collection) => (
                  <Link
                    key={collection.id}
                    href={`/collection/${collection.id}`}
                    className="grid grid-cols-[minmax(0,1fr)_72px] items-center gap-3 px-4 py-4 text-sm transition-colors hover:bg-[#FBF8F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#BA5C3D]/35 lg:grid-cols-[minmax(0,1fr)_120px_140px_92px] lg:gap-4 lg:px-5"
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-[#17202A]" title={collection.name}>
                        {collection.name}
                      </span>
                      <span className="mt-1 block truncate text-xs text-[#6B7280]" title={collection.description ?? "No description"}>
                        {collection.description ?? "No description"}
                      </span>
                    </span>
                    <span className="hidden text-[13px] text-[#6B7280] lg:block">{getDocumentCountLabel(collection.documentCount)}</span>
                    <span className="hidden text-[13px] text-[#6B7280] lg:block">{formatDate(collection.updatedAt)}</span>
                    <span className="justify-self-end rounded-[7px] border border-[#D9CBBB] bg-[#FBF8F3] px-3 py-1.5 text-[13px] font-semibold text-[#17202A]">
                      Open
                    </span>
                  </Link>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </main>
  );
}
