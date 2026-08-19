import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useLogout } from '../../features/auth/model/use-logout.js';
import { Button } from '../../shared/ui/Button.jsx';
import { getVisibleNavSections } from './nav-sections.js';
import { useOpenTasksCount } from '../../features/issuance/tasks/model/use-tasks-queries.js';
import { notify } from '../../shared/notifications/notification-store.js';
import styles from './AppLayout.module.css';

const STORAGE_KEY = 'workwear.nav.openSection';
const TASKS_REMINDER_STORAGE_KEY = 'workwear.tasksReminder.lastShownDate';
const QUICK_PATHS = ['/employees', '/issuance/documents', '/warehouses/balances', '/print-forms'];

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

  const canSeeTasks = Boolean(user?.permissions?.includes('issuance.manage'));
  const { data: openTasksCount } = useOpenTasksCount(canSeeTasks);

  // Напоминание не чаще раза в день (см. задачу "Отдать в сборку" —
  // локальная сеть без email/SMS, поэтому единственный доступный канал —
  // тост в интерфейсе при следующем открытии приложения). Дата последнего
  // показа — в localStorage, отдельно от бейджа-счётчика в меню, который
  // всегда актуален и не привязан к разу в день.
  useEffect(() => {
    if (!openTasksCount) return;
    const today = new Date().toISOString().slice(0, 10);
    let lastShown = null;
    try {
      lastShown = localStorage.getItem(TASKS_REMINDER_STORAGE_KEY);
    } catch {
      // localStorage недоступен (приватный режим и т.п.) — просто не запоминаем.
    }
    if (lastShown === today) return;
    notify.warning(
      `Незавершённых задач на дособор: ${openTasksCount}. Смотрите раздел «Задачи на дособор».`,
    );
    try {
      localStorage.setItem(TASKS_REMINDER_STORAGE_KEY, today);
    } catch {
      // Не критично — в худшем случае напоминание покажется ещё раз сегодня.
    }
  }, [openTasksCount]);
  const [navSearch, setNavSearch] = useState('');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const visibleItems = useMemo(
    () =>
      visibleSections.flatMap((section) =>
        section.items.map((item) => ({ ...item, sectionTitle: section.title })),
      ),
    [visibleSections],
  );

  const activeItem = useMemo(
    () =>
      [...visibleItems]
        .sort((left, right) => right.to.length - left.to.length)
        .find((item) =>
          item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to),
        ),
    [location.pathname, visibleItems],
  );

  const activeSectionTitle = useMemo(() => activeItem?.sectionTitle, [activeItem]);
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

  const quickItems = useMemo(
    () => QUICK_PATHS.map((path) => visibleItems.find((item) => item.to === path)).filter(Boolean),
    [visibleItems],
  );

  const toggleSection = (title) => {
    const next = openSection === title ? null : title;
    setSectionChoice({ pathname: location.pathname, title: next });
    if (next) localStorage.setItem(STORAGE_KEY, next);
    else localStorage.removeItem(STORAGE_KEY);
  };

  return (
    <div className={styles.layout}>
      {mobileMenuOpen && (
        <button
          type="button"
          className={styles.backdrop}
          onClick={() => setMobileMenuOpen(false)}
          aria-label="Закрыть меню"
        />
      )}
      <aside className={`${styles.sidebar} ${mobileMenuOpen ? styles.sidebarOpen : ''}`}>
        <div className={styles.brandRow}>
          <NavLink to="/" className={styles.brand} onClick={() => setMobileMenuOpen(false)}>
            <span className={styles.brandMark}>РЖД</span>
            <span>
              <strong>Учёт спецодежды</strong>
              <small>Локальная система</small>
            </span>
          </NavLink>
          <button
            type="button"
            className={styles.mobileClose}
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Закрыть меню"
          >
            ×
          </button>
        </div>
        {quickItems.length > 0 && (
          <div className={styles.quickNav} aria-label="Быстрый доступ">
            <span className={styles.quickNavTitle}>Быстрый доступ</span>
            <div>
              {quickItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                </NavLink>
              ))}
            </div>
          </div>
        )}
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
                    <span className={styles.navSectionIcon}>{section.icon}</span>
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
                          onClick={() => setMobileMenuOpen(false)}
                          className={({ isActive }) =>
                            `${styles.navLink} ${isActive ? styles.navLinkActive : ''}`
                          }
                        >
                          <span className={styles.navItemIcon}>{item.icon}</span>
                          <span>{item.label}</span>
                          {item.badge === 'issuance-open-tasks' && Boolean(openTasksCount) && (
                            <span className={styles.navBadge}>{openTasksCount}</span>
                          )}
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
          <div className={styles.pageContext}>
            <button
              type="button"
              className={styles.mobileMenuButton}
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Открыть меню"
            >
              ☰
            </button>
            <div>
              {activeSectionTitle && <span>{activeSectionTitle}</span>}
              <strong>{activeItem?.label ?? 'Рабочий экран'}</strong>
            </div>
          </div>
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
