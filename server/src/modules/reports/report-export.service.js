import { ApiError } from '../../utils/api-error.js';
import {
  generateTabularExcel,
  generateTabularPdf,
  dateLabel,
} from '../../utils/tabular-document.js';
import { buildExportFileName } from '../../utils/export-file-name.js';
import { reportsService } from './reports.service.js';
import { reportsRepository } from './reports.repository.js';

const REPORTS = {
  'stock-balances': {
    method: 'stockBalances',
    title: 'Остатки по складам',
    fileTitle: 'Остатки',
    fileScope: 'warehouse',
    columns: [
      ['warehouse.name', 'Склад', 22],
      ['genderCategoryLabel', 'Категория по полу', 18],
      ['model.name', 'Модель', 34],
      ['size.value', 'Размер', 12],
      ['heightSize.value', 'Рост', 10],
      ['quantity', 'Количество', 14, 'number'],
    ],
    totals: { quantity: 'quantity' },
  },
  'property-cost': {
    method: 'propertyCost',
    title: 'Имущество у работников',
    fileTitle: 'Имущество у работников',
    fileScope: 'dpo',
    columns: [
      ['employeeName', 'Работник', 34],
      ['dpoName', 'ДПО', 24],
      ['itemsCount', 'Предметов', 12, 'number'],
    ],
    totals: { itemsCount: 'itemsCount' },
  },
  purchases: {
    method: 'purchases',
    title: 'Поступления за период',
    fileTitle: 'Поступления',
    fileScope: 'warehouse',
    columns: [
      ['number', 'Номер', 18],
      ['documentDate', 'Дата', 13, 'date'],
      ['supplierName', 'Поставщик', 28],
      ['warehouseName', 'Склад', 24],
      ['quantity', 'Количество', 13, 'number'],
    ],
    totals: { quantity: 'quantity' },
  },
  suppliers: {
    method: 'suppliers',
    title: 'Поступления по поставщикам',
    fileTitle: 'Поступления по поставщикам',
    fileObject: 'Все поставщики',
    columns: [
      ['supplierName', 'Поставщик', 38],
      ['documentsCount', 'Документов', 14, 'number'],
      ['quantity', 'Количество', 14, 'number'],
    ],
    totals: { documentsCount: 'documentsCount', quantity: 'quantity' },
  },
  writeoffs: {
    method: 'writeoffs',
    title: 'Списания за период',
    fileTitle: 'Списания',
    fileScope: 'warehouse',
    columns: [
      ['number', 'Номер', 18],
      ['documentDate', 'Дата', 13, 'date'],
      ['warehouseName', 'Склад', 24],
      ['itemsCount', 'Позиций', 12, 'number'],
      ['reasons', 'Причины', 34, 'list'],
    ],
    totals: { itemsCount: 'itemsCount' },
  },
  repairs: {
    method: 'repairs',
    title: 'Завершённые ремонты',
    fileTitle: 'Ремонты',
    fileScope: 'warehouse',
    columns: [
      ['number', 'Номер', 18],
      ['completedAt', 'Завершён', 18, 'datetime'],
      ['warehouseName', 'Склад', 26],
      ['itemsCount', 'Позиций', 12, 'number'],
      ['cost', 'Стоимость ремонта', 20, 'money'],
    ],
    totals: { itemsCount: 'itemsCount', cost: 'cost' },
  },
  warehouses: {
    method: 'warehouses',
    title: 'Движения и остатки по складам',
    fileTitle: 'Движения по складам',
    fileScope: 'warehouse',
    columns: [
      ['warehouseName', 'Склад', 30],
      ['incoming', 'Поступления', 15, 'number'],
      ['outgoing', 'Выбытия', 15, 'number'],
      ['balanceQuantity', 'Остаток, шт.', 15, 'number'],
    ],
    totals: {
      incoming: 'incoming',
      outgoing: 'outgoing',
      balanceQuantity: 'balanceQuantity',
    },
  },
  employees: {
    method: 'employees',
    title: 'Работники',
    fileTitle: 'Обеспечение работников',
    fileScope: 'dpo',
    columns: [
      ['fullName', 'ФИО', 34],
      ['dpoName', 'ДПО', 24],
      ['hireDate', 'Дата приёма', 13, 'date'],
      ['terminationDate', 'Дата увольнения', 15, 'date'],
      ['tenureDays', 'Стаж, дн.', 12, 'number'],
      ['coverageDaysInPeriod', 'Дни обеспечения', 16, 'number'],
      ['propertyItemsCount', 'Выдано предметов', 16, 'number'],
    ],
    totals: {
      coverageDaysInPeriod: 'coverageDaysInPeriod',
      propertyItemsCount: 'propertyItemsCount',
    },
  },
  'employees-list': {
    method: 'employeesList',
    title: 'Список работников',
    fileTitle: 'Список работников',
    fileScope: 'dpo',
    columns: [
      ['fullName', 'ФИО', 30],
      ['personnelNumber', 'Табельный номер', 18],
      ['region', 'Регион', 20],
      ['positionName', 'Должность', 22],
      ['dpoName', 'ДПО', 24],
      ['status', 'Статус', 14],
    ],
    totals: {},
  },
  dpo: {
    method: 'dpo',
    title: 'Отчёт по ДПО',
    fileTitle: 'Отчёт по ДПО',
    fileScope: 'dpo',
    columns: [
      ['dpoName', 'ДПО', 32],
      ['employeesCount', 'Работников', 14, 'number'],
      ['issuedQuantityInPeriod', 'Выдано, шт.', 14, 'number'],
      ['coverageDaysInPeriod', 'Дни обеспечения', 18, 'number'],
      ['propertyItemsCount', 'На руках, шт.', 14, 'number'],
    ],
    totals: {
      employeesCount: 'employeesCount',
      issuedQuantityInPeriod: 'issuedQuantityInPeriod',
      coverageDaysInPeriod: 'coverageDaysInPeriod',
      propertyItemsCount: 'propertyItemsCount',
    },
  },
  turnover: {
    method: 'turnover',
    title: 'Сменяемость работников по ДПО',
    fileTitle: 'Сменяемость',
    fileScope: 'dpo',
    columns: [
      ['dpoName', 'ДПО', 26],
      ['positionName', 'Должность', 22],
      ['genderLabel', 'Пол', 12],
      ['start', 'На начало', 12, 'number'],
      ['hired', 'Принято', 12, 'number'],
      ['terminated', 'Уволено', 12, 'number'],
      ['end', 'На конец', 12, 'number'],
      ['average', 'Средняя численность', 16, 'decimal'],
      ['turnoverRate', 'Сменяемость, %', 14, 'percent'],
      ['turnoverPercent', 'Оборот кадров, %', 14, 'percent'],
    ],
    totals: {
      start: 'start',
      hired: 'hired',
      terminated: 'terminated',
      end: 'end',
      average: 'average',
      turnoverRate: 'turnoverRate',
      turnoverPercent: 'turnoverPercent',
    },
  },
};

async function fileObject(config, query) {
  if (config.fileObject) return config.fileObject;
  if (config.fileScope === 'warehouse') {
    if (!query.warehouseId) return 'Все склады';
    const [warehouse] = await reportsRepository.findWarehouses({
      warehouseId: query.warehouseId,
    });
    return warehouse?.name || 'Склад';
  }
  if (config.fileScope === 'dpo') {
    if (!query.dpoId) return 'Все ДПО';
    const [dpo] = await reportsRepository.findDpos({
      dpoId: query.dpoId,
      includeArchived: true,
    });
    return dpo?.name || 'ДПО';
  }
  return null;
}

function periodText(result) {
  const parts = [
    result.from && result.to
      ? `Период: ${dateLabel(result.from)} — ${dateLabel(result.to)}`
      : 'На текущий момент',
  ];
  if (result.groupByLabel) parts.push(`Группировка: ${result.groupByLabel}`);
  if (result.filtersText) parts.push(result.filtersText);
  if (result.generatedAt) {
    parts.push(`Сформировано ${new Date(result.generatedAt).toLocaleString('ru-RU')}`);
  }
  if (result.positionNote) parts.push(result.positionNote);
  if (result.incompleteHireCount) {
    parts.push(`Без даты приёма: ${result.incompleteHireCount} карточек`);
  }
  if (result.formulaText) parts.push(result.formulaText);
  return parts.join(' · ');
}

export const reportExportService = {
  async generate(report, query) {
    const config = REPORTS[report];
    if (!config) throw ApiError.notFound('Отчёт не найден');
    const format = query.format || 'xlsx';
    if (!['xlsx', 'pdf'].includes(format)) {
      throw ApiError.badRequest('Поддерживаются форматы xlsx и pdf');
    }
    const result = await reportsService[config.method](query);
    const configWithSubtitle = { ...config, subtitle: periodText(result) };
    const buffer =
      format === 'pdf'
        ? await generateTabularPdf(configWithSubtitle, result)
        : await generateTabularExcel(configWithSubtitle, result);
    const generatedAt = result.generatedAt ?? new Date();
    return {
      buffer,
      fileName: buildExportFileName({
        title: config.fileTitle,
        objects: [await fileObject(config, query)],
        ...(result.from && result.to
          ? { from: result.from, to: result.to }
          : { date: generatedAt }),
        extension: format,
      }),
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};
