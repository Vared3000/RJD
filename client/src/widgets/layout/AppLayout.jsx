import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useLogout } from '../../features/auth/model/use-logout.js';
import { Button } from '../../shared/ui/Button.jsx';
import { getVisibleNavSections } from './nav-sections.js';
import styles from './AppLayout.module.css';

const STORAGE_KEY = 'workwear.nav.expandedSections';

function loadStoredExpanded() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function AppLayout() {
  const user = useSessionStore((state) => state.user);
  const logout = useLogout();
  const location = useLocation();
  const visibleSections = useMemo(
    () => getVisibleNavSections(user?.permissions ?? []),
    [user?.permissions],
  );
  const [expandedOverrides, setExpandedOverrides] = useState(loadStoredExpanded);

  const activeSectionTitle = useMemo(
    () =>
      visibleSections.find((section) =>
        section.items.some((item) => item.to !== '/' && location.pathname.startsWith(item.to)),
      )?.title,
    [visibleSections, location.pathname],
  );

  const isSectionExpanded = (title) =>
    title in expandedOverrides ? expandedOverrides[title] : title === activeSectionTitle;

  const toggleSection = (title) => {
    setExpandedOverrides((prev) => {
      const next = { ...prev, [title]: !isSectionExpanded(title) };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Учёт спецодежды</div>
        <nav className={styles.nav}>
          {visibleSections.map((section) => {
            const expanded = !section.title || isSectionExpanded(section.title);
            return (
              <div key={section.title ?? 'main'} className={styles.navSection}>
                {section.title && (
                  <button
                    type="button"
                    className={styles.navSectionTitle}
                    aria-expanded={expanded}
                    onClick={() => toggleSection(section.title)}
                  >
                    <span className={styles.navSectionChevron}>{expanded ? '▾' : '▸'}</span>
                    {section.title}
                  </button>
                )}
                {expanded && (
                  <ul>
                    {section.items.map((item) => (
                      <li key={item.to}>
                        <NavLink
                          to={item.to}
                          end={item.end}
                          className={({ isActive }) =>
                            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                          }
                        >
                          {item.label}
                        </NavLink>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className={styles.content}>
        <header className={styles.topbar}>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user?.fullName}</span>
            <span className={styles.userRole}>{user?.role?.name}</span>
          </div>
          <Button variant="secondary" onClick={() => logout.mutate()} disabled={logout.isPending}>
            Выйти
          </Button>
        </header>
        <main className={styles.main}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
