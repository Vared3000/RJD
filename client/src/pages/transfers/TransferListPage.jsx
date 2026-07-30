import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  useTransferList,
  useTransferMutations,
} from '../../features/transfers/model/use-transfer-queries.js';
import { headerFields, headerSchema } from '../../features/transfers/model/header-schema.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const STATUS_LABELS = { draft: 'Черновик', posted: 'Проведён' };

export function TransferListPage() {
  const { data: documents, isLoading } = useTransferList();
  const { create } = useTransferMutations();
  const [isCreating, setIsCreating] = useState(false);
  const navigate = useNavigate();
  const canManage = useSessionStore((state) =>
    state.user?.permissions?.includes('transfers.manage'),
  );

  async function handleCreate(values) {
    const document = await create.mutateAsync(values);
    setIsCreating(false);
    navigate(`/transfers/documents/${document.id}`);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Перемещение</h1>
        {canManage && <Button onClick={() => setIsCreating(true)}>+ Создать</Button>}
      </div>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Номер</th>
              <th>Откуда</th>
              <th>Куда</th>
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
            {!isLoading && documents?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={5}>
                  Документов пока нет
                </td>
              </tr>
            )}
            {documents?.map((document) => (
              <tr
                key={document.id}
                className={styles.linkRow}
                onClick={() => navigate(`/transfers/documents/${document.id}`)}
              >
                <td>{document.number}</td>
                <td>{document.fromWarehouse?.name ?? '—'}</td>
                <td>{document.toWarehouse?.name ?? '—'}</td>
                <td>{document.documentDate}</td>
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
          title="Создать документ перемещения"
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
