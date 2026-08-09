import { useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useLogout } from '../../features/auth/model/use-logout.js';
import { Button } from '../../shared/ui/Button.jsx';
import { getVisibleNavSections } from './nav-sections.js';
import styles from './AppLayout.module.css';

const STORAGE_KEY = 'workwear.nav.openSection';

function loadStoredSection() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
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
  const [navSearch, setNavSearch] = useState('');

  const activeSectionTitle = useMemo(
    () =>
      visibleSections.find((section) =>
        section.items.some((item) => item.to !== '/' && location.pathname.startsWith(item.to)),
      )?.title,
    [visibleSections, location.pathname],
  );
  const [sectionChoice, setSectionChoice] = useState(() => ({
    pathname: location.pathname,
    title: activeSectionTitle ?? loadStoredSection(),
  }));
  const openSection =
    sectionChoice.pathname === location.pathname ? sectionChoice.title : activeSectionTitle;

  const filteredSections = useMemo(() => {
    const query = navSearch.trim().toLocaleLowerCase('ru-RU');
    if (!query) return visibleSections;

    return visibleSections
      .map((section) => {
        const sectionMatches = section.title?.toLocaleLowerCase('ru-RU').includes(query);
        const items = sectionMatches
          ? section.items
          : section.items.filter((item) => item.label.toLocaleLowerCase('ru-RU').includes(query));
        return { ...section, items };
      })
      .filter((section) => section.items.length > 0);
  }, [navSearch, visibleSections]);

  const isSectionExpanded = (title) => Boolean(navSearch.trim()) || openSection === title;

  const toggleSection = (title) => {
    const next = openSection === title ? null : title;
    setSectionChoice({ pathname: location.pathname, title: next });
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className={styles.layout}>
      <aside className={styles.sidebar}>
        <div className={styles.brand}>Учёт спецодежды</div>
        <div className={styles.navSearchWrap}>
          <span className={styles.navSearchIcon} aria-hidden="true">
            ⌕
          </span>
          <input
            type="search"
            className={styles.navSearch}
            value={navSearch}
            onChange={(event) => setNavSearch(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setNavSearch('');
            }}
            placeholder="Найти в меню…"
            aria-label="Поиск по меню"
          />
          {navSearch && (
            <button
              type="button"
              className={styles.clearNavSearch}
              onClick={() => setNavSearch('')}
              aria-label="Очистить поиск по меню"
            >
              ×
            </button>
          )}
        </div>
        <nav className={styles.nav} aria-label="Основное меню">
          {filteredSections.map((section) => {
            const expanded = !section.title || isSectionExpanded(section.title);
            const active = section.title === activeSectionTitle;
            return (
              <div key={section.title ?? 'main'} className={styles.navSection}>
                {section.title && (
                  <button
                    type="button"
                    className={`${styles.navSectionTitle} ${active ? styles.navSectionTitleActive : ''}`}
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
          {filteredSections.length === 0 && (
            <div className={styles.navEmpty}>
              <strong>Ничего не найдено</strong>
              <span>Попробуйте другое название</span>
            </div>
          )}
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
