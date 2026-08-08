import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { printFormSettingsApi } from '../../features/print-form-settings/api/print-form-settings-api.js';
import { partyFields, partySchema } from '../../features/print-form-settings/model/party-form.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const ROLE_LABELS = { executor: 'Исполнитель / продавец', customer: 'Заказчик / покупатель' };

export function PrintFormSettingsPage() {
  const [creating, setCreating] = useState(false);
  const queryClient = useQueryClient();
  const { data: versions, isLoading } = useQuery({
    queryKey: ['print-form-settings', 'parties'],
    queryFn: printFormSettingsApi.list,
  });
  const create = useMutation({
    mutationFn: printFormSettingsApi.create,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['print-form-settings'] }),
  });

  async function save(values) {
    await create.mutateAsync(values);
    setCreating(false);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div>
          <h1 className={styles.title}>Реквизиты печатных форм</h1>
          <p className={styles.hint}>
            Версии не редактируются: для изменения создайте новую с датой начала действия.
          </p>
        </div>
        <Button onClick={() => setCreating(true)}>+ Новая версия</Button>
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Сторона</th>
              <th>Действует с</th>
              <th>Наименование</th>
              <th>ИНН / КПП</th>
              <th>Руководитель</th>
              <th>Создал</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan="6" className={styles.hint}>
                  Загрузка…
                </td>
              </tr>
            )}
            {versions?.map((item) => (
              <tr key={item.id}>
                <td>{ROLE_LABELS[item.role]}</td>
                <td>{item.effectiveDate}</td>
                <td>{item.fullName}</td>
                <td>{[item.inn, item.kpp].filter(Boolean).join(' / ')}</td>
                <td>
                  {item.directorPosition}: {item.directorFullName}
                </td>
                <td>{item.createdByUser?.fullName ?? 'Системная версия'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {creating && (
        <EntityFormModal
          title="Новая версия реквизитов"
          fields={partyFields}
          schema={partySchema}
          defaultValues={{ effectiveDate: new Date().toISOString().slice(0, 10) }}
          onSubmit={save}
          onClose={() => setCreating(false)}
          isSaving={create.isPending}
          error={
            create.isError
              ? (create.error?.response?.data?.error?.message ?? 'Не удалось сохранить')
              : null
          }
        />
      )}
    </div>
  );
}
