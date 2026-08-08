import { useState } from 'react';
import {
  useAdminUsersList,
  useAdminUserMutations,
} from '../../features/admin/model/use-admin-queries.js';
import {
  createUserFields,
  createUserSchema,
  updateUserFields,
  updateUserSchema,
  resetPasswordFields,
  resetPasswordSchema,
} from '../../features/admin/model/user-form.js';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { Button } from '../../shared/ui/Button.jsx';
import { Select } from '../../shared/ui/Select.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import styles from '../../features/catalogs/ui/CatalogPage.module.css';

const { useList: useRolesList } = createCatalogHooks('admin/roles');

function errorMessage(mutation) {
  if (!mutation?.isError) return null;
  return mutation.error?.response?.data?.error?.message || 'Не удалось выполнить действие';
}

function formatDateTime(value) {
  if (!value) return 'ещё не входил';
  return new Date(value).toLocaleString('ru');
}

export function AdminUsersPage() {
  const [search, setSearch] = useState('');
  const [roleId, setRoleId] = useState('');
  const [isActive, setIsActive] = useState('');
  const { data: users, isLoading } = useAdminUsersList({
    search: search || undefined,
    roleId: roleId || undefined,
    isActive: isActive === '' ? undefined : isActive === 'true',
  });
  const { data: roles } = useRolesList(false);
  const { create, update, resetPassword, revokeSessions } = useAdminUserMutations();

  const [creating, setCreating] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [resettingUser, setResettingUser] = useState(null);
  const [revokingUser, setRevokingUser] = useState(null);

  const currentUserId = useSessionStore((state) => state.user?.id);
  const canManage = useSessionStore((state) => state.user?.permissions?.includes('admin.manage'));

  if (!canManage) {
    return <p className={styles.hint}>Недостаточно прав для просмотра этого раздела.</p>;
  }

  const roleOptions = [
    { value: '', label: 'Все роли' },
    ...(roles ?? []).map((role) => ({ value: role.id, label: role.name })),
  ];
  const statusOptions = [
    { value: '', label: 'Все статусы' },
    { value: 'true', label: 'Активные' },
    { value: 'false', label: 'Заблокированные' },
  ];

  async function handleCreate(values) {
    await create.mutateAsync(values);
    setCreating(false);
  }

  async function handleUpdate(values) {
    await update.mutateAsync({ id: editingUser.id, payload: values });
    setEditingUser(null);
  }

  async function handleResetPassword(values) {
    await resetPassword.mutateAsync({ id: resettingUser.id, payload: values });
    setResettingUser(null);
  }

  async function handleToggleActive(user) {
    await update.mutateAsync({ id: user.id, payload: { isActive: !user.isActive } });
  }

  async function handleRevokeSessions() {
    await revokeSessions.mutateAsync(revokingUser.id);
    setRevokingUser(null);
  }

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.title}>Администрирование: пользователи</h1>
        <Button onClick={() => setCreating(true)}>+ Создать</Button>
      </div>

      <div className={styles.filterBar}>
        <input
          type="search"
          placeholder="Поиск по логину/ФИО…"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className={styles.searchInput}
        />
        <Select
          value={roleId}
          onChange={(event) => setRoleId(event.target.value)}
          options={roleOptions}
        />
        <Select
          value={isActive}
          onChange={(event) => setIsActive(event.target.value)}
          options={statusOptions}
        />
      </div>

      {update.isError && !editingUser && <p className={styles.formError}>{errorMessage(update)}</p>}

      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Логин</th>
              <th>Роль</th>
              <th>Статус</th>
              <th>Последний вход</th>
              <th aria-label="Действия" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Загрузка…
                </td>
              </tr>
            )}
            {!isLoading && users?.length === 0 && (
              <tr>
                <td className={styles.hint} colSpan={6}>
                  Пользователи не найдены
                </td>
              </tr>
            )}
            {users?.map((user) => (
              <tr key={user.id}>
                <td>
                  {user.fullName}
                  {user.id === currentUserId && ' (вы)'}
                </td>
                <td>{user.login}</td>
                <td>{user.role?.name ?? '—'}</td>
                <td>
                  <span className={user.isActive ? styles.active : styles.archived}>
                    {user.isActive ? 'Активен' : 'Заблокирован'}
                  </span>
                </td>
                <td>{formatDateTime(user.lastLoginAt)}</td>
                <td className={styles.actions}>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setEditingUser(user)}
                  >
                    Изменить
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    disabled={update.isPending}
                    onClick={() => handleToggleActive(user)}
                  >
                    {user.isActive ? 'Заблокировать' : 'Разблокировать'}
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setResettingUser(user)}
                  >
                    Сбросить пароль
                  </button>
                  <button
                    type="button"
                    className={styles.linkButton}
                    onClick={() => setRevokingUser(user)}
                  >
                    Завершить сессии
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <EntityFormModal
          title="Создать пользователя"
          fields={createUserFields}
          schema={createUserSchema}
          defaultValues={{}}
          onSubmit={handleCreate}
          onClose={() => setCreating(false)}
          isSaving={create.isPending}
          error={errorMessage(create)}
        />
      )}

      {editingUser && (
        <EntityFormModal
          title={`Изменить: ${editingUser.fullName}`}
          fields={updateUserFields}
          schema={updateUserSchema}
          defaultValues={editingUser}
          onSubmit={handleUpdate}
          onClose={() => setEditingUser(null)}
          isSaving={update.isPending}
          error={errorMessage(update)}
        />
      )}

      {resettingUser && (
        <EntityFormModal
          title={`Сбросить пароль: ${resettingUser.fullName}`}
          fields={resetPasswordFields}
          schema={resetPasswordSchema}
          defaultValues={{}}
          onSubmit={handleResetPassword}
          onClose={() => setResettingUser(null)}
          isSaving={resetPassword.isPending}
          error={errorMessage(resetPassword)}
        />
      )}

      {revokingUser && (
        <Modal title="Завершить все сессии?" onClose={() => setRevokingUser(null)}>
          <p>
            Пользователь «{revokingUser.fullName}» будет разлогинен на всех устройствах — при
            следующем действии потребуется войти заново.
          </p>
          {revokeSessions.isError && (
            <p className={styles.formError}>{errorMessage(revokeSessions)}</p>
          )}
          <div className={styles.formActions}>
            <Button variant="secondary" onClick={() => setRevokingUser(null)}>
              Отмена
            </Button>
            <Button onClick={handleRevokeSessions} disabled={revokeSessions.isPending}>
              {revokeSessions.isPending ? 'Завершение…' : 'Завершить сессии'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}
