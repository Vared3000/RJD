import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { createCatalogHooks } from '../model/use-catalog-queries.js';
import { CatalogFormField } from './CatalogFormField.jsx';
import { Button } from '../../../shared/ui/Button.jsx';
import { Modal } from '../../../shared/ui/Modal.jsx';
import { useSessionStore } from '../../../shared/session/session-store.js';
import styles from './CatalogPage.module.css';

function defaultValuesFor(fields, item) {
  return Object.fromEntries(
    fields.map((field) => [
      field.name,
      item?.[field.name] ?? (field.type === 'number' ? undefined : ''),
    ]),
  );
}

// resource — сегмент REST-пути ('organizations', 'subdivisions', ...).
// columns — [{ key, label, render?(item) }] для таблицы.
// fields — конфигурация полей формы, см. CatalogFormField.jsx.
// schema — общая zod-схема формы (используется и для создания, и для правки).
export function CatalogPage({
  resource,
  title,
  columns,
  fields,
  schema,
  viewPermission = 'catalogs.view',
  managePermission = 'catalogs.manage',
}) {
  const { useList, useCatalogMutations } = createCatalogHooks(resource);
  const [showArchived, setShowArchived] = useState(false);
  const { data: items, isLoading } = useList(showArchived);
  const { create, update, archive, restore } = useCatalogMutations();
  const [editingItem, setEditingItem] = useState(null);
  const permissions = useSessionStore((state) => state.user?.permissions ?? []);
  const canView = permissions.includes(viewPermission);
  const canManage = permissions.includes(managePermission);

  const form = useForm({ resolver: zodResolver(schema) });
  const saveError = create.error ?? update.error;
  const isSaving = create.isPending || update.isPending;

  function openCreate() {
    form.reset(defaultValuesFor(fields));
    create.reset();
    update.reset();
    setEditingItem({});
  }

  function openEdit(item) {
    form.reset(defaultValuesFor(fields, item));
    create.reset();
    update.reset();
    setEditingItem(item);
  }

  function closeModal() {
    setEditingItem(null);
  }

  async function onSubmit(values) {
    if (editingItem?.id) {
      await update.mutateAsync({ id: editingItem.id, payload: values });
    } else {
      await create.mutateAsync(values);
    }
    closeModal();
  }

  if (!canView) {
    return <p className={styles.hint}>Недостаточно прав для просмотра этого раздела.</p>;
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>{title}</h1>
        {canManage && <Button onClick={openCreate}>+ Добавить</Button>}
      </div>

      <label className={styles.archiveToggle}>
        <input
          type="checkbox"
          checked={showArchived}
          onChange={(event) => setShowArchived(event.target.checked)}
        />
        Показать архивные
      </label>

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column.key}>{column.label}</th>
              ))}
              <th>Статус</th>
              {canManage && <th aria-label="Действия" />}
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={columns.length + 2}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && items?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={columns.length + 2}>
                  Ничего не найдено
                </td>
              </tr>
            )}
            {items?.map((item) => (
              <tr key={item.id}>
                {columns.map((column) => (
                  <td key={column.key}>
                    {column.render ? column.render(item) : (item[column.key] ?? '—')}
                  </td>
                ))}
                <td>
                  {item.archivedAt ? (
                    <span className={styles.archived}>В архиве</span>
                  ) : (
                    <span className={styles.active}>Активно</span>
                  )}
                </td>
                {canManage && (
                  <td className={styles.actions}>
                    {!item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => openEdit(item)}
                      >
                        Изменить
                      </button>
                    )}
                    {!item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => archive.mutate(item.id)}
                      >
                        В архив
                      </button>
                    )}
                    {item.archivedAt && (
                      <button
                        type="button"
                        className={styles.linkButton}
                        onClick={() => restore.mutate(item.id)}
                      >
                        Восстановить
                      </button>
                    )}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {editingItem !== null && (
        <Modal
          title={editingItem.id ? `Изменить: ${title}` : `Создать: ${title}`}
          onClose={closeModal}
        >
          <form className={styles.form} onSubmit={form.handleSubmit(onSubmit)} noValidate>
            {fields.map((field) => (
              <CatalogFormField key={field.name} field={field} form={form} />
            ))}
            {saveError && (
              <p className={styles.formError}>
                {saveError?.response?.data?.error?.message || 'Не удалось сохранить'}
              </p>
            )}
            <div className={styles.formActions}>
              <Button type="button" variant="secondary" onClick={closeModal}>
                Отмена
              </Button>
              <Button type="submit" disabled={isSaving}>
                {isSaving ? 'Сохранение…' : 'Сохранить'}
              </Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
