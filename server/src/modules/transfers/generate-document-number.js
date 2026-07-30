import { sequelize } from '../../database/models/index.js';

export async function generateDocumentNumber() {
  const [[row]] = await sequelize.query("SELECT nextval('transfer_document_number_seq') AS value");
  return `ПМ-${String(row.value).padStart(6, '0')}`;
}
