import { ApiError } from '../../../utils/api-error.js';
import {
  generateTabularExcel,
  generateTabularPdf,
  dateLabel,
} from '../../../utils/tabular-document.js';
import { issuanceService } from './issuance.service.js';

// Задание на сборку — внутренний рабочий документ (не входит в каталог
// официальных печатных форм print-forms), который кладовщик получает вместо
// самого черновика: что нужно найти и подготовить под конкретную выдачу, ещё
// до проведения (на черновике строки не привязаны к конкретным экземплярам —
// подбор происходит только при проведении). Строится напрямую из текущих
// строк документа (draft или posted), а не через тяжёлый маркерный движок
// print-forms — здесь нет ни реквизитов сторон, ни исторических цен.

const SIZE_TYPE_LABELS = {
  clothing: 'Размер',
  height: 'Рост',
  shoe: 'Обувь',
  headwear: 'Головной убор',
  belt: 'Ремень',
  gloves: 'Перчатки',
};

function sizeLabel(size) {
  if (!size) return '—';
  return `${SIZE_TYPE_LABELS[size.type] ?? size.type}: ${size.value}`;
}

const CONFIG = {
  title: 'Задание на сборку',
  columns: [
    ['modelName', 'Модель', 36],
    ['sizeLabel', 'Размер', 18],
    ['heightLabel', 'Рост', 10],
    ['quantity', 'Количество', 14, 'number'],
  ],
  totals: { quantity: 'quantity' },
};

export const assemblyOrderService = {
  async generate(documentId, format) {
    if (!['xlsx', 'pdf'].includes(format)) {
      throw ApiError.badRequest('Поддерживаются форматы xlsx и pdf');
    }
    const document = await issuanceService.getById(documentId);
    if (!document.lines || document.lines.length === 0) {
      throw ApiError.badRequest('В документе нет позиций');
    }

    const rows = document.lines.map((line) => ({
      modelName: line.model?.name ?? '—',
      sizeLabel: sizeLabel(line.size),
      heightLabel: line.heightSize?.value ?? '—',
      quantity: line.quantity,
    }));
    const result = {
      rows,
      totals: { quantity: rows.reduce((sum, row) => sum + row.quantity, 0) },
    };
    const config = {
      ...CONFIG,
      subtitle:
        `Выдача № ${document.number} от ${dateLabel(document.documentDate)} · ` +
        `${document.employee?.fullName ?? '—'} · склад: ${document.warehouse?.name ?? '—'}`,
    };

    const buffer =
      format === 'pdf'
        ? await generateTabularPdf(config, result)
        : await generateTabularExcel(config, result);
    return {
      buffer,
      fileName: `assembly-order_${document.number}.${format}`,
      contentType:
        format === 'pdf'
          ? 'application/pdf'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    };
  },
};
