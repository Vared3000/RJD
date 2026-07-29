import { sequelize } from '../../../database/models/index.js';

export async function generateInventoryNumber() {
  const [[row]] = await sequelize.query("SELECT nextval('instance_inventory_number_seq') AS value");
  return `СО-${String(row.value).padStart(6, '0')}`;
}
