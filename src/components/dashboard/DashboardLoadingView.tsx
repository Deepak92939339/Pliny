import { BrandMark } from "@/components/shared/BrandMark";
import styles from "./DashboardView.module.css";

// Share the finished dashboard's geometry and breakpoints.
export function DashboardLoadingView() {
  return (
    <div className={styles.shell} aria-busy="true">
      <p role="status" className={styles.srOnly}>Loading your workspaces…</p>
      <header className={styles.topbar} aria-hidden="true">
        <span className={styles.hamburger}><span className={styles.skeletonIcon} /></span>
        <span className={styles.brandLinkTop}><BrandMark className={styles.brandMark} textClassName={styles.brandText} /></span>
        <span className={styles.accountWrap}><span className={styles.accountBtn}><span className={`${styles.avatar} ${styles.skeleton}`} /></span></span>
      </header>
      <div className={styles.body}>
        <aside className={styles.sidebar} aria-hidden="true">
          <div className={styles.sideBrand}><BrandMark className={styles.brandMark} textClassName={styles.brandText} /></div>
          <div className={styles.sideCreateWrap}><span className={`${styles.sideCreate} ${styles.loadingButton}`}><span className={styles.loadingPlus}>+</span>New workspace</span></div>
          <div className={styles.sideNav}>
            <p className={styles.navLabel}>Workspaces</p>
            <div className={styles.navList}>
              <span className={`${styles.navItem} ${styles.navItemCurrent}`}>Your workspaces</span>
              {[0, 1, 2].map((item) => <span className={styles.navItem} key={item}><span className={`${styles.skeleton} ${styles.skeletonName}`} /></span>)}
            </div>
          </div>
          <div className={styles.sideFoot}><span className={`${styles.avatar} ${styles.skeleton}`} /><span className={`${styles.skeleton} ${styles.skeletonName}`} /></div>
        </aside>
        <main className={styles.canvas}>
          <div className={styles.pageHead}>
            <div className={styles.pageHeadText}>
              <p className={styles.eyebrow}>Private document intelligence</p>
              <h1 className={styles.title}>Your workspaces</h1>
              <p className={styles.lede}>Create a workspace, upload documents, and ask questions with source-backed answers.</p>
            </div>
            <span aria-hidden="true" className={`${styles.headCreate} ${styles.loadingButton}`}><span className={styles.loadingPlus}>+</span>New workspace</span>
          </div>
          <div aria-hidden="true" className={styles.workspaceList}>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <colgroup><col className={styles.col1} /><col className={styles.col2} /><col className={styles.col4} /><col className={styles.col5} /></colgroup>
                <thead><tr><th className={styles.th}>Workspace</th><th className={styles.th}>Documents</th><th className={styles.th}>Updated</th><th className={styles.th} /></tr></thead>
                <tbody>{[0, 1, 2, 3].map((item) => <tr className={styles.row} key={item}>
                  <td className={styles.td}><span className={`${styles.skeleton} ${styles.skeletonName}`} /><span className={`${styles.skeleton} ${styles.skeletonMode}`} /></td>
                  <td className={styles.td}><span className={`${styles.skeleton} ${styles.skeletonShort}`} /></td>
                  <td className={styles.td}><span className={`${styles.skeleton} ${styles.skeletonDate}`} /></td>
                  <td className={styles.td}><span className={`${styles.skeleton} ${styles.skeletonIcon}`} /></td>
                </tr>)}</tbody>
              </table>
            </div>
            <ul className={styles.wsCards}>
              {[0, 1, 2, 3].map((item) => <li className={styles.wsCard} key={item}>
                <span className={`${styles.skeleton} ${styles.skeletonName}`} />
                <span className={`${styles.skeleton} ${styles.skeletonMode}`} />
                <span className={`${styles.skeleton} ${styles.skeletonDate}`} />
                <div className={styles.wsCardActions}><span className={`${styles.skeleton} ${styles.skeletonIcon}`} /></div>
              </li>)}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
