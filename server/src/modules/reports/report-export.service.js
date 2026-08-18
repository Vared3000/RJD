import { ApiError } from '../../utils/api-error.js';
import {
  generateTabularExcel,
  generateTabularPdf,
  isoDate,
  dateLabel,
} from '../../utils/tabular-document.js';
import { reportsService } from './reports.service.js';

const REPORTS = {
  'stock-balances': {
    method: 'stockBalances',
    title: 'Остатки по складам',
    columns: [
      ['warehouse.name', 'Склад', 24],
      ['model.name', 'Модель', 38],
      ['size.value', 'Размер', 12],
      ['heightSize.value', 'Рост', 10],
      ['quantity', 'Количество', 14, 'number'],
    ],
    totals: { quantity: 'quantity' },
  },
  'property-cost': {
    method: 'propertyCost',
    title: 'Имущество у работников',
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
    title: 'Работники',
    columns: [
      ['fullName', 'ФИО', 32],
      ['gender', 'Пол', 10],
      ['organizationName', 'Организация', 22],
      ['subdivisionName', 'Подразделение', 22],
      ['positionName', 'Должность', 20],
      ['dpoName', 'ДПО', 24],
      ['hireDate', 'Дата приёма', 13, 'date'],
      ['tenureDays', 'Стаж, дн.', 11, 'number'],
      ['terminationDate', 'Дата увольнения', 15, 'date'],
      ['status', 'Статус', 12],
    ],
    totals: {},
  },
  dpo: {
    method: 'dpo',
    title: 'Отчёт по ДПО',
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
};

function periodText(result) {
  return result.from && result.to
    ? `Период: ${dateLabel(result.from)} — ${dateLabel(result.to)}`
    : 'На текущий момент';
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
    const periodSuffix =
      result.from && result.to ? `_${isoDate(result.from)}_${isoDate(result.to)}` : '';
    return {
      buffer,
      fileName: `${report}${periodSuffix}.${format}`,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};
