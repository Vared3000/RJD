import { DataTypes } from 'sequelize';

// Партия создаётся документом "Поступление" (Этап 5). Модель и таблица заведены
// уже сейчас, так как на партию ссылается Instance (Этап 4).
export function defineBatch(sequelize) {
  return sequelize.define(
    'Batch',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      code: { type: DataTypes.STRING(64), allowNull: false },
      supplierId: { type: DataTypes.UUID, allowNull: true, field: 'supplier_id' },
      receivedDate: { type: DataTypes.DATEONLY, allowNull: true, field: 'received_date' },
      note: { type: DataTypes.STRING(500), allowNull: true },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    { tableName: 'batches' },
  );
}
