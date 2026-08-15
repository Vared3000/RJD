import { Link } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useStockBalances } from '../../features/warehouses/stock/model/use-stock-queries.js';
import { getVisibleNavSections } from '../../widgets/layout/nav-sections.js';
import styles from './DashboardPage.module.css';

function formatMoney(value) {
  return `${Number(value ?? 0).toLocaleString('ru-RU')} ₽`;
}

const QUICK_ACTIONS = [
  {
    label: 'Оформить выдачу',
    description: 'Создать документ и подобрать одежду работнику',
    to: '/issuance/documents',
    icon: '→',
    permission: 'issuance.manage',
  },
  {
    label: 'Принять поступление',
    description: 'Добавить новую партию одежды на склад',
    to: '/purchases/receiving',
    icon: '↓',
    permission: 'purchases.manage',
  },
  {
    label: 'Найти работника',
    description: 'Открыть карточку, размеры и историю выдач',
    to: '/employees',
    icon: '♙',
    permission: 'employees.view',
  },
  {
    label: 'Сформировать документ',
    description: 'Скачать акт, расписку или отчёт в Excel/PDF',
    to: '/print-forms',
    icon: '▧',
    permission: 'print_forms.use',
  },
];

const WORKFLOW = [
  ['Поступление', '/purchases/receiving', 'purchases.manage'],
  ['Склад', '/warehouses/balances', 'warehouse.view'],
  ['Выдача', '/issuance/documents', 'issuance.manage'],
  ['Эксплуатация'],
  ['Возврат', '/issuance/returns', 'issuance.manage'],
  ['Обслуживание', '/laundry/documents', 'laundry.manage'],
  ['Повторная выдача', '/issuance/documents', 'issuance.manage'],
  ['Списание', '/writeoff/documents', 'writeoff.manage'],
];

export function DashboardPage() {
  const user = useSessionStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canViewStock = permissions.includes('warehouse.view');
  const { data: stockRows } = useStockBalances(undefined, { enabled: canViewStock });
  const totalQuantity = stockRows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;
  const totalCost = stockRows?.reduce((sum, row) => sum + row.totalCost, 0) ?? 0;
  const sections = getVisibleNavSections(permissions).filter((section) => section.title);
  const actions = QUICK_ACTIONS.filter((item) => permissions.includes(item.permission));
  const today = new Intl.DateTimeFormat('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}>Главная</h1>
      <section className={styles.welcome}>
        <div>
          <span className={styles.date}>{today}</span>
          <h2>Добро пожаловать, {user?.fullName}</h2>
          <p>Выберите рабочую операцию или найдите нужный раздел через меню слева.</p>
        </div>
        {canViewStock && stockRows && (
          <Link to="/warehouses/balances" className={styles.stockSummary}>
            <span>На складах</span>
            <strong>{totalQuantity.toLocaleString('ru-RU')} ед.</strong>
            <small>{formatMoney(totalCost)}</small>
          </Link>
        )}
      </section>

      {actions.length > 0 && (
        <section>
          <div className={styles.sectionHeading}>
            <div>
              <h2>Быстрые действия</h2>
              <p>Самые частые операции — без поиска по разделам</p>
            </div>
          </div>
          <div className={styles.actionsGrid}>
            {actions.map((action) => (
              <Link key={action.to} to={action.to} className={styles.actionCard}>
                <span className={styles.actionIcon}>{action.icon}</span>
                <span>
                  <strong>{action.label}</strong>
                  <small>{action.description}</small>
                </span>
                <span className={styles.actionArrow}>›</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className={styles.workflowCard}>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Путь одежды</h2>
            <p>Быстрый переход к каждому этапу жизненного цикла</p>
          </div>
        </div>
        <div className={styles.workflow}>
          {WORKFLOW.map(([label, to, permission], index) => {
            const available = to && (!permission || permissions.includes(permission));
            return (
              <div className={styles.workflowStep} key={`${label}-${index}`}>
                <span className={styles.stepNumber}>{index + 1}</span>
                {available ? <Link to={to}>{label}</Link> : <span>{label}</span>}
              </div>
            );
          })}
        </div>
      </section>

      <section>
        <div className={styles.sectionHeading}>
          <div>
            <h2>Все разделы</h2>
            <p>Функции программы сгруппированы по рабочим задачам</p>
          </div>
        </div>
        <div className={styles.sectionGrid}>
          {sections.map((section) => (
            <div key={section.title} className={styles.sectionCard}>
              <div className={styles.sectionCardTitle}>
                <span>{section.icon}</span>
                <strong>{section.title}</strong>
              </div>
              <div className={styles.sectionLinks}>
                {section.items.slice(0, 6).map((item) => (
                  <Link key={item.to} to={item.to}>
                    {item.label}
                    <span>›</span>
                  </Link>
                ))}
                {section.items.length > 6 && <small>Остальные пункты доступны в меню слева</small>}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
