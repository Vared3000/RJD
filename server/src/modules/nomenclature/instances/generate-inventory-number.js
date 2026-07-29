import { sequelize } from '../../../database/models/index.js';

function format(value) {
  return `СО-${String(value).padStart(6, '0')}`;
}

export async function generateInventoryNumber() {
  const [[row]] = await sequelize.query("SELECT nextval('instance_inventory_number_seq') AS value");
  return format(row.value);
}

// Для массового создания (проведение документа поступления) — один запрос
// вместо N последовательных nextval().
export async function generateInventoryNumbers(count) {
  if (count <= 0) return [];
  const [rows] = await sequelize.query(
    "SELECT nextval('instance_inventory_number_seq') AS value FROM generate_series(1, :count)",
    { replacements: { count } },
  );
  return rows.map((row) => format(row.value));
}
