import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useLaundryList,
  useLaundryMutations,
} from '../../features/laundry/model/use-laundry-queries.js';
import { headerFields, headerSchema } from '../../features/laundry/model/header-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', sent: 'Отправлен', completed: 'Завершён' };

export function LaundryListPage() {
  const { data: documents, isLoading } = useLaundryList();
  const { create } = useLaundryMutations();
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const canManage = useSessionStore((state) => state.user?.permissions?.includes('laundry.manage'));

  async function handleCreate(values) {
    const document = await create.mutateAsync(values);
    setIsCreating(false);
    navigate(`/laundry/documents/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Стирка</h1>
        {canManage && <Button onClick={() => setIsCreating(true)}>+ Создать</Button>}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Склад</th>
              <th>Дата</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={4}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && documents?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={4}>
                  Документов пока нет
                </td>
              </tr>
            )}
            {documents?.map((document) => (
              <tr
                key={document.id}
                className={styles.linkRow}
                onClick={() => navigate(`/laundry/documents/${document.id}`)}
              >
                <td>{document.number}</td>
                <td>{document.warehouse?.name ?? '—'}</td>
                <td>{document.documentDate}</td>
                <td>
                  <span
                    className={document.status === 'completed' ? styles.active : styles.archived}
                  >
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
          title="Создать документ стирки"
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
