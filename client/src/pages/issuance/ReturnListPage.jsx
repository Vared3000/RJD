import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useReturnList,
  useReturnMutations,
} from '../../features/issuance/returns/model/use-return-queries.js';
import { headerFields, headerSchema } from '../../features/issuance/returns/model/header-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import { formatDate } from '../../shared/lib/format-date.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };

export function ReturnListPage() {
  const { data: documents, isLoading } = useReturnList();
  const { create } = useReturnMutations();
  const [isCreating, setIsCreating] = useState(false);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const navigate = useNavigate();
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('issuance.manage'),
  );
  const normalizedSearch = search.trim().toLocaleLowerCase('ru-RU');
  const filteredDocuments = (documents ?? []).filter((document) => {
    const matchesStatus = status === 'all' || document.status === status;
    const haystack = [document.number, document.employee?.fullName, document.warehouse?.name]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase('ru-RU');
    return matchesStatus && (!normalizedSearch || haystack.includes(normalizedSearch));
  });

  async function handleCreate(values) {
    const document = await create.mutateAsync(values);
    setIsCreating(false);
    navigate(`/issuance/returns/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerText}>
          <h1 className={styles.title}>Возвраты от работников</h1>
          <p className={styles.subtitle}>
            Возврат одежды на склад и проверка состояния экземпляров.
          </p>
        </div>
        {canManage && <Button onClick={() => setIsCreating(true)}>+ Новый возврат</Button>}
      </div>

      <div className={styles.filterBar}>
        <input
          type="search"
          className={styles.searchInput}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Номер, работник или склад…"
          aria-label="Поиск документов возврата"
        />
        <select value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="all">Все статусы</option>
          <option value="draft">Черновики</option>
          <option value="posted">Проведённые</option>
        </select>
      </div>

      <div className={styles.summaryBar}>
        <span className={styles.summaryItem}>
          Найдено: <strong>{filteredDocuments.length}</strong>
        </span>
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Работник</th>
              <th>Склад</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={5}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && filteredDocuments.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={5}>
                  По выбранным условиям ничего не найдено
                </td>
              </tr>
            )}
            {filteredDocuments.map((document) => (
              <tr
                key={document.id}
                className={styles.linkRow}
                tabIndex={0}
                onClick={() => navigate(`/issuance/returns/${document.id}`)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(`/issuance/returns/${document.id}`);
                  }
                }}
              >
                <td>{document.number}</td>
                <td>{document.employee?.fullName ?? '—'}</td>
                <td>{document.warehouse?.name ?? '—'}</td>
                <td>{formatDate(document.documentDate)}</td>
                <td>
                  <span className={document.status === 'posted' ? styles.active : styles.archived}>
                    {STATUS_LABELS[document.status] ?? document.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {isCreating && (
        <EntityFormModal
          title="Создать документ возврата"
          fields={headerFields}
          schema={headerSchema}
          defaultValues={{}}
          onSubmit={handleCreate}
          onClose={() => setIsCreating(false)}
          isSaving={create.isPending}
          error={
            create.error
              ? create.error?.response?.data?.error?.message || 'Не удалось создать'
              : null
          }
        />
      )}
    </div>
  );
}
