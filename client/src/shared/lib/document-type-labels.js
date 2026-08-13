// Единый источник истины для значений documentType (задача 22) — консолидирует
// маппинг, ранее продублированный в InstanceCardPage.jsx. Соответствует
// server/src/modules/nomenclature/instances/document-type-registry.js.
export const DOCUMENT_TYPE_LABELS = {
  receiving: 'Поступление',
  issuance: 'Выдача',
  return: 'Возврат',
  transfer: 'Перемещение',
  writeoff: 'Списание',
  laundry: 'Стирка',
  repair: 'Ремонт',
  stock_adjustment: 'Корректировка',
  inventory: 'Инвентаризация',
};

export const DOCUMENT_PATHS = {
  receiving: '/purchases/receiving',
  issuance: '/issuance/documents',
  return: '/issuance/returns',
  transfer: '/transfers/documents',
  writeoff: '/writeoff/documents',
  laundry: '/laundry/documents',
  repair: '/repair/documents',
  stock_adjustment: '/adjustments/documents',
  inventory: '/inventory/documents',
};
