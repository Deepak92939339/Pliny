"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { BrandMark } from "@/components/shared/BrandMark";
import { DeleteCollectionButton } from "@/components/dashboard/DeleteCollectionButton";
import { NewWorkspaceDialog } from "@/components/dashboard/NewWorkspaceDialog";
import { logout } from "@/lib/auth/actions";
import type { CollectionListItem } from "@/types";
import styles from "./DashboardView.module.css";

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

function modeLabel(mode: CollectionListItem["defaultProcessingMode"]) {
  return mode === "privacy_minimised" ? "PRIVACY-MINIMISED" : "STANDARD";
}

function MenuGlyph() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function ChevronGlyph() {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

function ReadyBadge() {
  return (
    <span className={styles.badge}>
      <span className={styles.badgeDot} aria-hidden="true" />
      Ready
    </span>
  );
}

export function DashboardView({ userEmail, collections, collectionsError }: DashboardViewProps) {
  const router = useRouter();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  const drawerTriggerRef = useRef<HTMLButtonElement>(null);
  const drawerCloseRef = useRef<HTMLButtonElement>(null);
  const drawerRef = useRef<HTMLElement>(null);
  const accountTriggerRef = useRef<HTMLButtonElement>(null);
  const accountMenuRef = useRef<HTMLDivElement>(null);

  const initial = (userEmail ?? "").charAt(0).toUpperCase() || "P";

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (accountOpen) {
        setAccountOpen(false);
        accountTriggerRef.current?.focus();
        return;
      }
      if (drawerOpen) {
        setDrawerOpen(false);
        drawerTriggerRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [accountOpen, drawerOpen]);

  useEffect(() => {
    if (!accountOpen) return;
    const first = accountMenuRef.current?.querySelector<HTMLAnchorElement | HTMLButtonElement>('[role="menuitem"]');
    first?.focus();
    function onDown(event: MouseEvent) {
      const target = event.target as Node;
      if (!accountMenuRef.current?.contains(target) && !accountTriggerRef.current?.contains(target)) {
        setAccountOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [accountOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    drawerCloseRef.current?.focus();
    return () => {
      document.body.style.overflow = previous;
    };
  }, [drawerOpen]);

  useEffect(() => {
    if (!drawerOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key !== "Tab") return;
      const container = drawerRef.current;
      if (!container) return;
      const focusables = Array.from(
        container.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>("a[href], button:not([disabled])"),
      ).filter((element) => element.offsetParent !== null);
      if (focusables.length === 0) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawerOpen]);

  function closeDrawer() {
    setDrawerOpen(false);
    drawerTriggerRef.current?.focus();
  }

  function onAccountKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();
    const items = Array.from(
      accountMenuRef.current?.querySelectorAll<HTMLAnchorElement | HTMLButtonElement>('[role="menuitem"]') ?? [],
    );
    if (items.length === 0) return;
    const index = items.indexOf(document.activeElement as HTMLAnchorElement | HTMLButtonElement);
    let next = index;
    if (event.key === "ArrowDown") next = (index + 1) % items.length;
    if (event.key === "ArrowUp") next = (index - 1 + items.length) % items.length;
    if (event.key === "Home") next = 0;
    if (event.key === "End") next = items.length - 1;
    items[next]?.focus();
  }

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <button
          ref={drawerTriggerRef}
          type="button"
          className={styles.hamburger}
          aria-expanded={drawerOpen}
          aria-controls="workspace-drawer"
          aria-label={drawerOpen ? "Close workspace navigation" : "Open workspace navigation"}
          onClick={() => setDrawerOpen(true)}
        >
          <MenuGlyph />
        </button>
        <Link href="/dashboard" className={styles.brandLinkTop} aria-label="Pliny dashboard">
          <BrandMark className={styles.brandMark} textClassName={styles.brandText} />
        </Link>
        <div className={styles.accountWrap}>
          <button
            ref={accountTriggerRef}
            type="button"
            className={styles.accountBtn}
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            aria-controls="account-menu"
            onClick={() => setAccountOpen((open) => !open)}
          >
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <ChevronGlyph />
            <span className={styles.srOnly}>Account menu</span>
          </button>
          {accountOpen ? (
            <div
              ref={accountMenuRef}
              id="account-menu"
              role="menu"
              aria-label="Account"
              className={styles.accountMenu}
              onKeyDown={onAccountKeyDown}
            >
              <Link href="/dashboard" role="menuitem" className={styles.menuItem} onClick={() => setAccountOpen(false)}>
                All workspaces
              </Link>
              <form action={logout} className={styles.menuForm}>
                <button type="submit" role="menuitem" className={styles.menuItem}>
                  Sign out
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </header>

      <div className={styles.body}>
        {drawerOpen ? <div className={styles.backdrop} aria-hidden="true" onClick={closeDrawer} /> : null}

        <aside
          ref={drawerRef}
          id="workspace-drawer"
          className={`${styles.sidebar} ${drawerOpen ? styles.sidebarOpen : ""}`}
          aria-label="Workspace navigation"
        >
          <div className={styles.drawerHead}>
            <span className={styles.drawerTitle}>Workspaces</span>
            <button
              ref={drawerCloseRef}
              type="button"
              className={styles.drawerClose}
              aria-label="Close workspace navigation"
              onClick={closeDrawer}
            >
              <CloseGlyph />
            </button>
          </div>
          <div className={styles.sideBrand}>
            <Link href="/dashboard" aria-label="Pliny dashboard" className={styles.sideBrandLink}>
              <BrandMark className={styles.brandMark} textClassName={styles.brandText} />
            </Link>
          </div>
          <div className={styles.sideCreateWrap}>
            <NewWorkspaceDialog
              tone="paper"
              size="default"
              variant="outline"
              className={styles.sideCreate}
            />
          </div>
          <nav className={styles.sideNav} aria-label="Workspaces">
            <p className={styles.navLabel}>Workspaces</p>
            <ul className={styles.navList}>
              <li>
                <Link href="/dashboard" className={`${styles.navItem} ${styles.navItemCurrent}`} aria-current="page">
                  <span className={styles.navName}>Your workspaces</span>
                  <span className={styles.chip}>{collections.length}</span>
                </Link>
              </li>
              {collections.map((collection) => (
                <li key={collection.id}>
                  <Link href={`/collection/${collection.id}`} className={styles.navItem} title={collection.name}>
                    <span className={styles.navName}>{collection.name}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <div className={styles.sideFoot}>
            <span className={styles.avatar} aria-hidden="true">
              {initial}
            </span>
            <span className={styles.sideFootText}>
              <span className={styles.sideEmail} title={userEmail ?? undefined}>
                {userEmail ?? "Signed in"}
              </span>
              <form action={logout}>
                <button type="submit" className={styles.signOut}>
                  Sign out
                </button>
              </form>
            </span>
          </div>
        </aside>

        <main className={styles.canvas}>
          <div className={styles.pageHead}>
            <div className={styles.pageHeadText}>
              <p className={styles.eyebrow}>Private document intelligence</p>
              <h1 className={styles.title}>Your workspaces</h1>
              <p className={styles.lede}>Create a workspace, upload documents, and ask questions with source-backed answers.</p>
            </div>
            <NewWorkspaceDialog tone="default" size="default" className={styles.headCreate} />
          </div>

          {collectionsError ? (
            <section className={styles.errorCard} aria-label="Workspace list error">
              <h2 className={styles.errorTitle}>We couldn&apos;t load your workspaces right now. Your data is safe — retry when you&apos;re back online.</h2>
              <p className={styles.errorDetail}>{toWorkspaceCopy(collectionsError)}</p>
              <button type="button" className={styles.retryBtn} onClick={() => router.refresh()}>
                Try again
              </button>
            </section>
          ) : collections.length === 0 ? (
            <section className={styles.emptyCard} aria-label="No workspaces yet">
              <h2 className={styles.emptyTitle}>No workspaces yet</h2>
              <p className={styles.emptyBody}>Create your first workspace to start uploading documents and asking source-backed questions.</p>
              <NewWorkspaceDialog tone="default" size="default" className={styles.emptyCreate} />
            </section>
          ) : (
            <section className={styles.tableCard} aria-label="Your workspaces">
              <div className={styles.tableWrap}>
                <table className={styles.table} aria-label="Your workspaces">
                  <colgroup>
                    <col className={styles.col1} />
                    <col className={styles.col2} />
                    <col className={styles.col3} />
                    <col className={styles.col4} />
                    <col className={styles.col5} />
                  </colgroup>
                  <thead>
                    <tr>
                      <th scope="col" className={styles.th}>Workspace</th>
                      <th scope="col" className={styles.th}>Documents</th>
                      <th scope="col" className={styles.th}>Status</th>
                      <th scope="col" className={styles.th}>Updated</th>
                      <th scope="col" className={styles.th}>
                        <span className={styles.srOnly}>Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {collections.map((collection) => (
                      <tr key={collection.id} className={styles.row}>
                        <td className={styles.td}>
                          <Link className={styles.wName} href={`/collection/${collection.id}`} title={collection.name}>
                            {collection.name}
                          </Link>
                          <span className={styles.wSub}>{modeLabel(collection.defaultProcessingMode)}</span>
                        </td>
                        <td className={styles.td}>{collection.documentCount}</td>
                        <td className={styles.td}>
                          <ReadyBadge />
                        </td>
                        <td className={styles.td}>{formatDate(collection.updatedAt)}</td>
                        <td className={`${styles.td} ${styles.delCell}`}>
                          <DeleteCollectionButton collectionId={collection.id} collectionName={collection.name} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <ul className={styles.wsCards} aria-label="Your workspaces">
                {collections.map((collection) => (
                  <li key={collection.id} className={styles.wsCard}>
                    <div className={styles.wsCardTop}>
                      <Link className={styles.wName} href={`/collection/${collection.id}`} title={collection.name}>
                        {collection.name}
                      </Link>
                      <ReadyBadge />
                    </div>
                    <span className={styles.wSub}>{modeLabel(collection.defaultProcessingMode)}</span>
                    <p className={styles.wsCardMeta}>
                      {getDocumentCountLabel(collection.documentCount)} · Updated {formatDate(collection.updatedAt)}
                    </p>
                    <div className={`${styles.wsCardActions} ${styles.delCell}`}>
                      <DeleteCollectionButton collectionId={collection.id} collectionName={collection.name} />
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}
