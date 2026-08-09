import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { z } from 'zod';
import { createCatalogHooks } from '../../features/catalogs/model/use-catalog-queries.js';
import { EntityFormModal } from '../../features/catalogs/ui/EntityFormModal.jsx';
import { GENDER_LABELS } from '../../features/employees/model/employee-form.js';
import { Button } from '../../shared/ui/Button.jsx';
import { Modal } from '../../shared/ui/Modal.jsx';
import { useSessionStore } from '../../shared/session/session-store.js';
import catalogStyles from '../../features/catalogs/ui/CatalogPage.module.css';
import styles from './KitsPage.module.css';

const positionsHooks = createCatalogHooks('positions');
const kitsHooks = createCatalogHooks('kits');
const SEASON_LABELS = { summer: 'Летний', winter: 'Зимний' };
const KIT_VARIANT_LABELS = { ...GENDER_LABELS, unisex: 'Унисекс', all: 'Все варианты' };
const emptyToNull = (value) => (value === '' || value === undefined ? null : value);

const kitItemSchema = z.object({
  modelId: z.string().uuid('Выберите модель'),
  quantity: z.coerce.number().int().positive('Количество должно быть больше нуля').default(1),
  season: z.enum(['summer', 'winter'], {
    errorMap: () => ({ message: 'Выберите сезон' }),
  }),
  gender: z.preprocess(emptyToNull, z.enum(['male', 'female']).nullable().optional()),
  serviceLifeYears: z.coerce
    .number()
    .int()
    .min(1, 'Минимальный срок — 1 год')
    .max(20, 'Максимальный срок — 20 лет'),
});

const kitItemFields = [
  {
    name: 'modelId',
    label: 'Вещь',
    type: 'select',
    searchable: true,
    serverSearch: true,
    optionsResource: 'nomenclature-models',
    optionValue: 'id',
    optionLabel: 'name',
    placeholder: 'Введите название вещи…',
  },
  {
    name: 'season',
    label: 'Сезон',
    type: 'select',
    options: [
      { value: 'summer', label: 'Летний' },
      { value: 'winter', label: 'Зимний' },
    ],
  },
  {
    name: 'gender',
    label: 'Вариант комплекта',
    type: 'select',
    placeholder: 'Унисекс',
    options: Object.entries(GENDER_LABELS).map(([value, label]) => ({ value, label })),
  },
  { name: 'quantity', label: 'Количество', type: 'number', defaultValue: 1 },
  {
    name: 'serviceLifeYears',
    label: 'Срок использования, лет',
    type: 'number',
    defaultValue: 2,
  },
];

function mutationError(...mutations) {
  const failed = mutations.find((mutation) => mutation?.isError);
  return failed?.error?.response?.data?.error?.message ?? null;
}

function tabItems(items, tab) {
  if (tab === 'archive') return items.filter((item) => item.archivedAt);
  const active = items.filter((item) => !item.archivedAt);
  if (tab === 'unassigned') return active.filter((item) => !item.season);
  return active.filter((item) => item.season === tab);
}

function genderItems(items, gender) {
  if (gender === 'all') return items;
  if (gender === 'unisex') return items.filter((item) => !item.gender);
  return items.filter((item) => item.gender === gender);
}

export function KitsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const [selectedPosition, setSelectedPosition] = useState(null);
  const [activeTab, setActiveTab] = useState('summer');
  const [activeGender, setActiveGender] = useState('male');
  const [editingItem, setEditingItem] = useState(null);
  const page = Math.max(1, Number(searchParams.get('page')) || 1);
  const permissions = useSessionStore((state) => state.user?.permissions ?? []);
  const canView = permissions.includes('employees.view');
  const canManage = permissions.includes('employees.manage');

  const {
    data: positions,
    meta: positionsMeta,
    isLoading: positionsLoading,
  } = positionsHooks.useList(false, {
    search: debouncedSearch,
    page,
    limit: 50,
    sort: 'name',
    order: 'ASC',
  });
  const { data: kitItems, isLoading: kitLoading } = kitsHooks.useList(
    true,
    { positionId: selectedPosition?.id, limit: 200 },
    { enabled: Boolean(selectedPosition) },
  );
  const { create, update, archive, restore } = kitsHooks.useCatalogMutations();

  useEffect(() => {
    const timeout = setTimeout(() => setDebouncedSearch(search.trim()), 350);
    return () => clearTimeout(timeout);
  }, [search]);

  useEffect(() => {
    setSearchParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (debouncedSearch) next.set('search', debouncedSearch);
        else next.delete('search');
        next.set('page', String(page));
        return next;
      },
      { replace: true },
    );
  }, [debouncedSearch, page, setSearchParams]);

  const allKitItems = useMemo(() => kitItems ?? [], [kitItems]);
  const currentTabItems = useMemo(() => tabItems(allKitItems, activeTab), [activeTab, allKitItems]);
  const visibleKitItems = useMemo(() => {
    const items =
      activeTab === 'summer' || activeTab === 'winter'
        ? genderItems(currentTabItems, activeGender)
        : currentTabItems;
    return items.toSorted((left, right) =>
      (left.model?.name ?? '').localeCompare(right.model?.name ?? '', 'ru'),
    );
  }, [activeGender, activeTab, currentTabItems]);
  const tabCounts = {
    summer: tabItems(allKitItems, 'summer').length,
    winter: tabItems(allKitItems, 'winter').length,
    unassigned: tabItems(allKitItems, 'unassigned').length,
    archive: tabItems(allKitItems, 'archive').length,
  };
  const genderCounts = {
    male: genderItems(currentTabItems, 'male').length,
    female: genderItems(currentTabItems, 'female').length,
    unisex: genderItems(currentTabItems, 'unisex').length,
    all: currentTabItems.length,
  };

  function goToPage(nextPage) {
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.set('page', String(nextPage));
      return next;
    });
  }

  function openPosition(position) {
    setSelectedPosition(position);
    setActiveTab('summer');
    setActiveGender('male');
    setEditingItem(null);
    create.reset();
    update.reset();
    archive.reset();
    restore.reset();
  }

  function closePosition() {
    setSelectedPosition(null);
    setEditingItem(null);
  }

  async function saveItem(values) {
    const payload = { ...values, positionId: selectedPosition.id };
    if (editingItem?.id) {
      await update.mutateAsync({ id: editingItem.id, payload });
    } else {
      await create.mutateAsync(payload);
    }
    setActiveTab(values.season);
    setActiveGender(values.gender ?? 'unisex');
    setEditingItem(null);
  }

  if (!canView) {
    return <p className={catalogStyles.hint}>Недостаточно прав для просмотра этого раздела.</p>;
  }

  return (
    <div className={catalogStyles.page}>
      <div className={catalogStyles.header}>
        <div>
          <h1 className={catalogStyles.title}>Комплекты по должностям</h1>
          <p className={styles.subtitle}>Выберите должность, чтобы настроить её одежду.</p>
        </div>
      </div>

      <div className={catalogStyles.filterBar}>
        <input
          type="search"
          aria-label="Поиск должности"
          placeholder="Поиск должности…"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            goToPage(1);
          }}
          className={catalogStyles.searchInput}
        />
      </div>

      <div className={catalogStyles.tableWrap}>
        <table className={catalogStyles.table}>
          <thead>
            <tr>
              <th>Должность</th>
            </tr>
          </thead>
          <tbody>
            {positionsLoading && (
              <tr>
                <td className={catalogStyles.hint}>Загрузка…</td>
              </tr>
            )}
            {!positionsLoading && positions?.length === 0 && (
              <tr>
                <td className={catalogStyles.hint}>Должности не найдены</td>
              </tr>
            )}
            {positions?.map((position) => (
              <tr key={position.id} className={catalogStyles.linkRow}>
                <td>
                  <button
                    type="button"
                    className={styles.positionButton}
                    onClick={() => openPosition(position)}
                  >
                    {position.name}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {(positionsMeta?.pages ?? 0) > 1 && (
        <nav className={catalogStyles.pagination} aria-label="Навигация по страницам">
          <Button
            variant="secondary"
            disabled={page <= 1 || positionsLoading}
            onClick={() => goToPage(page - 1)}
          >
            Назад
          </Button>
          <span>
            Страница {positionsMeta.page} из {positionsMeta.pages} · должностей:{' '}
            {positionsMeta.total}
          </span>
          <Button
            variant="secondary"
            disabled={page >= positionsMeta.pages || positionsLoading}
            onClick={() => goToPage(page + 1)}
          >
            Далее
          </Button>
        </nav>
      )}

      {selectedPosition && editingItem === null && (
        <Modal
          title={`Комплект: ${selectedPosition.name}`}
          onClose={closePosition}
          closeOnOverlayClick={false}
          size="wide"
        >
          <div className={styles.tabs} role="tablist" aria-label="Сезоны комплекта">
            {[
              ['summer', 'Летний'],
              ['winter', 'Зимний'],
              ['unassigned', 'Без сезона'],
              ['archive', 'Архив'],
            ].map(([value, label]) => (
              <button
                key={value}
                type="button"
                role="tab"
                aria-selected={activeTab === value}
                className={`${styles.tab} ${activeTab === value ? styles.activeTab : ''}`}
                onClick={() => setActiveTab(value)}
              >
                {label} ({tabCounts[value]})
              </button>
            ))}
          </div>

          {(activeTab === 'summer' || activeTab === 'winter') && (
            <div className={styles.variantFilter}>
              <span className={styles.filterLabel}>Вариант комплекта</span>
              <div className={styles.variantTabs} role="tablist" aria-label="Пол комплекта">
                {[
                  ['male', 'Мужской'],
                  ['female', 'Женский'],
                  ['unisex', 'Унисекс'],
                  ['all', 'Все варианты'],
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="tab"
                    aria-selected={activeGender === value}
                    className={`${styles.tab} ${activeGender === value ? styles.activeTab : ''}`}
                    onClick={() => setActiveGender(value)}
                  >
                    {label} ({genderCounts[value]})
                  </button>
                ))}
              </div>
              <p className={styles.variantHint}>
                Мужские и женские вещи подбираются работникам соответствующего пола. Унисекс
                подходит всем.
              </p>
            </div>
          )}

          {activeTab === 'unassigned' && tabCounts.unassigned > 0 && (
            <p className={styles.warning}>
              Эти импортированные позиции не участвуют в автоматическом подборе. Откройте строку и
              назначьте ей летний или зимний сезон.
            </p>
          )}

          <div className={styles.kitToolbar}>
            <span className={styles.itemCount}>Позиций: {visibleKitItems.length}</span>
            {canManage && (activeTab === 'summer' || activeTab === 'winter') && (
              <Button
                onClick={() =>
                  setEditingItem({
                    season: activeTab,
                    gender: activeGender === 'all' || activeGender === 'unisex' ? '' : activeGender,
                    quantity: 1,
                    serviceLifeYears: 2,
                  })
                }
              >
                + Добавить вещь
              </Button>
            )}
          </div>

          {mutationError(archive, restore) && (
            <p className={catalogStyles.formError}>{mutationError(archive, restore)}</p>
          )}

          <div className={catalogStyles.tableWrap}>
            <table className={catalogStyles.table}>
              <thead>
                <tr>
                  <th>Вещь</th>
                  <th>Сезон</th>
                  <th>Вариант комплекта</th>
                  <th>Кол-во</th>
                  <th>Срок</th>
                  {canManage && <th aria-label="Действия" />}
                </tr>
              </thead>
              <tbody>
                {kitLoading && (
                  <tr>
                    <td className={catalogStyles.hint} colSpan={canManage ? 6 : 5}>
                      Загрузка…
                    </td>
                  </tr>
                )}
                {!kitLoading && visibleKitItems.length === 0 && (
                  <tr>
                    <td className={catalogStyles.hint} colSpan={canManage ? 6 : 5}>
                      {activeTab === 'summer' || activeTab === 'winter'
                        ? `В варианте «${KIT_VARIANT_LABELS[activeGender]}» пока нет вещей`
                        : 'В этом разделе пока нет вещей'}
                    </td>
                  </tr>
                )}
                {visibleKitItems.map((item) => (
                  <tr key={item.id}>
                    <td>{item.model?.name ?? '—'}</td>
                    <td>{SEASON_LABELS[item.season] ?? 'Не назначен'}</td>
                    <td>{GENDER_LABELS[item.gender] ?? 'Унисекс'}</td>
                    <td>{item.quantity}</td>
                    <td>{item.serviceLifeYears ? `${item.serviceLifeYears} г.` : '—'}</td>
                    {canManage && (
                      <td className={catalogStyles.actions}>
                        {!item.archivedAt ? (
                          <>
                            <button
                              type="button"
                              className={catalogStyles.linkButton}
                              onClick={() => setEditingItem(item)}
                            >
                              Изменить
                            </button>
                            <button
                              type="button"
                              className={catalogStyles.linkButton}
                              disabled={archive.isPending}
                              onClick={() => archive.mutate(item.id)}
                            >
                              Удалить
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            className={catalogStyles.linkButton}
                            disabled={restore.isPending}
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
        </Modal>
      )}

      {selectedPosition && editingItem !== null && (
        <EntityFormModal
          title={`${editingItem.id ? 'Изменить' : 'Добавить'} вещь: ${selectedPosition.name} — ${KIT_VARIANT_LABELS[editingItem.gender || 'unisex'].toLowerCase()} комплект`}
          fields={kitItemFields}
          schema={kitItemSchema}
          defaultValues={editingItem}
          onSubmit={saveItem}
          onClose={() => setEditingItem(null)}
          isSaving={create.isPending || update.isPending}
          error={mutationError(create, update)}
        />
      )}
    </div>
  );
}
