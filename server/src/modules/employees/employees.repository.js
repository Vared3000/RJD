import { Op, literal } from 'sequelize';
import { models } from '../../database/models/index.js';
import { createReferenceRepository } from '../catalogs/reference-crud.factory.js';
import {
  addOrGroup,
  applyEmployeeStatusFilter,
  computeEmployeeStatus,
  EMPLOYEE_STATUS_LABELS,
} from './employee-status.js';

const employeeInclude = [
  { model: models.Organization, as: 'organization', attributes: ['id', 'name'] },
  { model: models.Subdivision, as: 'subdivision', attributes: ['id', 'name'] },
  { model: models.Position, as: 'position', attributes: ['id', 'name'] },
  { model: models.Dpo, as: 'dpo', attributes: ['id', 'name', 'region'] },
  { model: models.Size, as: 'clothingSize', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'shoeSize', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'headwearSize', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'beltSize', attributes: ['id', 'type', 'value'] },
  { model: models.Size, as: 'glovesSize', attributes: ['id', 'type', 'value'] },
  {
    model: models.EmployeeMeasurement,
    as: 'measurements',
    attributes: ['id', 'sizeType', 'value'],
  },
];

// Отдельный include для постраничного list() — без hasMany-инклюда
// measurements (список работников их не показывает, см.
// CLAUDE_REVIEW_TASK.md пункт 3). Без hasMany-инклюда Sequelize больше не
// оборачивает findAndCountAll в subQuery, и order по вычисляемому статусу
// (buildOrder, case 'status') может использовать обычный sequelize.literal()
// без ошибок резолва алиаса, задокументированных в HANDOFF.md. findById
// (правка/карточка через createReferenceRepository) по-прежнему использует
// полный employeeInclude с measurements.
const employeeListInclude = employeeInclude.filter((entry) => entry.as !== 'measurements');

// Составная сортировка по умолчанию и сортировка по полю ДПО/региона/
// должности/статуса (раздел «Релиз В» ТЗ от 19.08.2026) требуют сортировки
// по колонке присоединённой таблицы и по вычисляемому статусу — generic-
// фабрика справочников (reference-crud.factory.js) поддерживает только
// сортировку по одной собственной колонке модели, поэтому list() здесь
// переопределён целиком, а не расширяет фабрику. Остальные методы
// (findById/create/archive/...) переиспользуются из фабрики без изменений.
const baseRepository = createReferenceRepository(models.Employee, {
  searchFields: ['fullName', 'personnelNumber'],
  include: employeeInclude,
});

function buildOrder(sort, direction) {
  const dir = direction === 'DESC' ? 'DESC' : 'ASC';
  const dpoRef = { model: models.Dpo, as: 'dpo' };
  const positionRef = { model: models.Position, as: 'position' };
  switch (sort) {
    case 'fullName':
      return [['fullName', dir]];
    case 'personnelNumber':
      return [
        ['personnelNumber', dir],
        ['fullName', 'ASC'],
      ];
    case 'region':
      return [
        [dpoRef, 'region', dir],
        ['fullName', 'ASC'],
      ];
    case 'position':
      return [
        [positionRef, 'name', dir],
        ['fullName', 'ASC'],
      ];
    case 'dpo':
      return [
        [dpoRef, 'name', dir],
        ['fullName', 'ASC'],
      ];
    case 'status': {
      // Активен(archivedAt=NULL,terminationDate=NULL/будущее) -> Уволен
      // (archivedAt=NULL,terminationDate=прошлое) -> В архиве(archivedAt
      // задан). Раньше здесь была сортировка по сырому terminationDate без
      // CASE (см. историю в git) — она путала группировку: работник с ещё не
      // наступившей (будущей) датой увольнения по-прежнему «Активен», но
      // сортировка по значению даты ставила его ПОСЛЕ всех «Уволен» (тех, у
      // кого дата уже в прошлом), а не рядом с остальными активными
      // (CLAUDE_REVIEW_TASK.md пункт 3). С 2026-08-20 список работников
      // (list(), ниже) больше не подключает hasMany-инклюд measurements,
      // поэтому findAndCountAll не оборачивается в subQuery и обычный
      // sequelize.literal() в order резолвится штатно (без него, как
      // задокументировано выше в git-истории, ловились ошибки резолва
      // алиаса) — используем его для явного вычисления ранга «Уволен» на
      // дату запроса. Регион/ДПО перед ФИО в качестве стабильного
      // довключения — тот же порядок тай-брейка, что и у сортировки по
      // умолчанию, и что использует sortPersonnelListRows() в
      // reports.service.js для печатной формы: экран и выгрузка должны
      // давать одинаковый порядок при одинаковом sort=status.
      const nulls = dir === 'ASC' ? 'NULLS FIRST' : 'NULLS LAST';
      const terminatedRank = literal(
        'CASE WHEN "termination_date" IS NOT NULL AND "termination_date" <= CURRENT_DATE THEN 1 ELSE 0 END',
      );
      return [
        ['archivedAt', `${dir} ${nulls}`],
        [terminatedRank, dir],
        [dpoRef, 'region', 'ASC'],
        [dpoRef, 'name', 'ASC'],
        ['fullName', 'ASC'],
      ];
    }
    default:
      // Сортировка по умолчанию: Регион -> ДПО -> ФИО (все по возрастанию).
      return [
        [dpoRef, 'region', 'ASC'],
        [dpoRef, 'name', 'ASC'],
        ['fullName', 'ASC'],
      ];
  }
}

export const employeeRepository = {
  ...baseRepository,
  async list({
    includeArchived = false,
    search,
    page = 1,
    limit = 50,
    sort,
    order = 'ASC',
    filters = {},
  } = {}) {
    const where = includeArchived ? {} : { archivedAt: null };
    if (filters.dpoId) where.dpoId = filters.dpoId;
    applyEmployeeStatusFilter(where, filters.status);
    if (search) {
      addOrGroup(
        where,
        ['fullName', 'personnelNumber'].map((field) => ({
          [field]: { [Op.iLike]: `%${search}%` },
        })),
      );
    }

    // Регион принадлежит Dpo, не Employee: два простых запроса (Dpo -> id[])
    // вместо where+required на include — тот же приём, что в
    // reportsRepository.findEmployeesForPersonnelList, чтобы фильтрация по
    // региону не расходилась между экраном и печатной формой.
    if (filters.region) {
      const matchingDpos = await models.Dpo.findAll({
        where: { region: filters.region },
        attributes: ['id'],
      });
      const regionDpoIds = matchingDpos.map((dpo) => dpo.id);
      where.dpoId = filters.dpoId
        ? regionDpoIds.filter((id) => id === filters.dpoId)
        : { [Op.in]: regionDpoIds };
    }

    const offset = (Number(page) - 1) * Number(limit);
    const { count, rows } = await models.Employee.findAndCountAll({
      where,
      include: employeeListInclude,
      order: buildOrder(sort, String(order).toUpperCase()),
      limit: Number(limit),
      offset,
    });

    // Единый вычисляемый статус (CLAUDE_REVIEW_TASK.md пункт 2) — те же
    // приоритет и функция, что использует печатная форма списка работников
    // (reportsService.employeesList), чтобы список на экране не показывал
    // «Активно» для уволенного, но не архивного работника.
    const now = new Date();
    const mappedRows = rows.map((row) => {
      const plain = row.toJSON();
      const statusCode = computeEmployeeStatus(plain, now);
      return { ...plain, statusCode, status: EMPLOYEE_STATUS_LABELS[statusCode] };
    });

    return { count, rows: mappedRows };
  },
};

export const employeeRelationsRepository = {
  sequelize: models.Employee.sequelize,

  findActive(modelName, id, { transaction } = {}) {
    return models[modelName].findOne({ where: { id, archivedAt: null }, transaction });
  },

  createDpoAssignment(data, { transaction }) {
    return models.EmployeeDpoAssignment.create(data, { transaction });
  },

  findActiveDpoAssignment(employeeId, { transaction }) {
    return models.EmployeeDpoAssignment.findOne({
      where: { employeeId, validTo: null },
      transaction,
      lock: transaction.LOCK.UPDATE,
    });
  },

  updateDpoAssignment(assignment, data, { transaction }) {
    return assignment.update(data, { transaction });
  },

  deleteDpoAssignment(assignment, { transaction }) {
    return assignment.destroy({ transaction });
  },

  closeActiveDpoAssignments(employeeId, validTo, { transaction }) {
    return models.EmployeeDpoAssignment.update(
      { validTo },
      { where: { employeeId, validTo: null }, transaction },
    );
  },

  findIssuedProperty(employeeId) {
    return models.Instance.findAll({
      where: { employeeId, status: 'issued', archivedAt: null },
      include: [
        { model: models.NomenclatureModel, as: 'model', attributes: ['id', 'name'] },
        { model: models.Size, as: 'size', attributes: ['id', 'type', 'value'] },
        { model: models.Size, as: 'heightSize', attributes: ['id', 'type', 'value'] },
      ],
      order: [['createdAt', 'ASC']],
    });
  },
};
