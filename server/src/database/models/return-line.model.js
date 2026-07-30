import { DataTypes } from 'sequelize';

export function defineReturnLine(sequelize) {
  return sequelize.define(
    'ReturnLine',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      condition: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'good' },
      // Куда направить экземпляр вместо in_stock (Этап 9) — 'in_stock' по
      // умолчанию; 'laundry'/'repair' минуют склад и сразу уходят в статус
      // Instance, соответствующий этому направлению.
      routeTo: {
        type: DataTypes.STRING(16),
        allowNull: false,
        defaultValue: 'in_stock',
        field: 'route_to',
      },
      note: { type: DataTypes.STRING(500), allowNull: true },
      sortOrder: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0,
        field: 'sort_order',
      },
    },
    { tableName: 'return_lines' },
  );
}
