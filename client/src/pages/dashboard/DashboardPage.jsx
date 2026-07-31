import { Link } from 'react-router-dom';
import { useSessionStore } from '../../shared/session/session-store.js';
import { useStockBalances } from '../../features/warehouses/stock/model/use-stock-queries.js';
import { getVisibleNavSections } from '../../widgets/layout/nav-sections.js';
import styles from './DashboardPage.module.css';

function formatMoney(value) {
  return `${Number(value ?? 0).toLocaleString('ru-RU')} ₽`;
}

// Раздел 1 ТЗ: полный жизненный цикл спецодежды. "Оприходование" ведёт туда
// же, куда "Закупка" — в этом приложении это один документ (Поступление).
// "Эксплуатация" не кликабельна — это период у работника, а не документ.
const LIFECYCLE_STAGES = [
  { label: 'Закупка', to: '/purchases/receiving', permission: 'purchases.manage' },
  { label: 'Оприходование', to: '/purchases/receiving', permission: 'purchases.manage' },
  { label: 'Склад', to: '/warehouses/balances', permission: 'warehouse.view' },
  { label: 'Выдача', to: '/issuance/documents', permission: 'issuance.manage' },
  { label: 'Эксплуатация' },
  { label: 'Возврат', to: '/issuance/returns', permission: 'issuance.manage' },
  { label: 'Стирка', to: '/laundry/documents', permission: 'laundry.manage' },
  { label: 'Ремонт', to: '/repair/documents', permission: 'laundry.manage' },
  { label: 'Повторная выдача', to: '/issuance/documents', permission: 'issuance.manage' },
  { label: 'Списание', to: '/writeoff/documents', permission: 'writeoff.manage' },
];

export function DashboardPage() {
  const user = useSessionStore((state) => state.user);
  const permissions = user?.permissions ?? [];
  const canViewStock = permissions.includes('warehouse.view');

  const { data: stockRows } = useStockBalances(undefined, { enabled: canViewStock });
  const totalQuantity = stockRows?.reduce((sum, row) => sum + row.quantity, 0) ?? 0;
  const totalCost = stockRows?.reduce((sum, row) => sum + row.totalCost, 0) ?? 0;

  const sections = getVisibleNavSections(permissions).filter((section) => section.title);

  return (
    <div className={styles.page}>
      <h1 className={styles.title}>Главная</h1>
      <p className={styles.hint}>
        Добро пожаловать, {user?.fullName}. Роль: {user?.role?.name}.
      </p>

      {canViewStock && stockRows && (
        <div className={styles.kpiRow}>
          <Link to="/warehouses/balances" className={styles.kpiTile}>
            <span className={styles.kpiLabel}>Остатки на складах</span>
            <span className={styles.kpiValue}>{totalQuantity} ед.</span>
            <span className={styles.kpiSub}>{formatMoney(totalCost)}</span>
          </Link>
        </div>
      )}

      <div className={styles.lifecycle}>
        <div className={styles.cardTitle}>Жизненный цикл спецодежды</div>
        <div className={styles.lifecycleRow}>
          {LIFECYCLE_STAGES.map((stage, index) => (
            <span key={`${stage.label}-${index}`} className={styles.lifecycleItem}>
              {index > 0 && <span className={styles.lifecycleArrow}>→</span>}
              {stage.to && (!stage.permission || permissions.includes(stage.permission)) ? (
                <Link to={stage.to} className={styles.lifecycleStage}>
                  {stage.label}
                </Link>
              ) : (
                <span className={styles.lifecycleStagePlain}>{stage.label}</span>
              )}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.grid}>
        {sections.map((section) => (
          <div key={section.title} className={styles.card}>
            <div className={styles.cardTitle}>{section.title}</div>
            <ul className={styles.cardList}>
              {section.items.map((item) => (
                <li key={item.to}>
                  <Link to={item.to} className={styles.cardLink}>
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
