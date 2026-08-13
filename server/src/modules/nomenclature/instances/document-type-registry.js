import { models } from '../../../database/models/index.js';

// Единственный источник истины для значений documentType, встречающихся в
// stock_movements.document_type / instance_events.document_type (полиморфная
// ссылка без FK — см. docs/architecture.md). Используется задачей 22 для
// разрешения "какой документ заблокировал редактирование" в человекочитаемое
// сообщение.
export const DOCUMENT_TYPE_REGISTRY = {
  receiving: { model: models.ReceivingDocument, label: 'Поступление' },
  issuance: { model: models.IssuanceDocument, label: 'Выдача' },
  return: { model: models.ReturnDocument, label: 'Возврат' },
  transfer: { model: models.TransferDocument, label: 'Перемещение' },
  writeoff: { model: models.WriteoffDocument, label: 'Списание' },
  laundry: { model: models.LaundryDocument, label: 'Стирка' },
  repair: { model: models.RepairDocument, label: 'Ремонт' },
  stock_adjustment: { model: models.StockAdjustment, label: 'Корректировка' },
  inventory: { model: models.InventoryDocument, label: 'Инвентаризация' },
};

// pairs: [{ documentType, documentId }] -> Map("type:id" -> { documentType, label, documentId, number })
export async function resolveDocumentLabels(pairs, { transaction } = {}) {
  const byType = new Map();
  for (const { documentType, documentId } of pairs) {
    if (!byType.has(documentType)) byType.set(documentType, new Set());
    byType.get(documentType).add(documentId);
  }

  const result = new Map();
  for (const [documentType, idSet] of byType) {
    const entry = DOCUMENT_TYPE_REGISTRY[documentType];
    if (!entry) continue;
    const rows = await entry.model.findAll({
      where: { id: [...idSet] },
      attributes: ['id', 'number'],
      transaction,
    });
    for (const row of rows) {
      result.set(`${documentType}:${row.id}`, {
        documentType,
        label: entry.label,
        documentId: row.id,
        number: row.number,
      });
    }
  }
  return result;
}
