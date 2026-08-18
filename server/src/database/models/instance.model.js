import { DataTypes } from 'sequelize';

// Жизненный цикл экземпляра (раздел 1 ТЗ), без учётных состояний документов
// закупки — те относятся к документу, а не к уже созданному экземпляру.
export const INSTANCE_STATUSES = ['in_stock', 'issued', 'laundry', 'repair', 'write_off'];
// Физическое состояние — независимая от статуса характеристика.
export const INSTANCE_CONDITIONS = ['new', 'good', 'worn', 'damaged'];

export function defineInstance(sequelize) {
  return sequelize.define(
    'Instance',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      batchId: { type: DataTypes.UUID, allowNull: true, field: 'batch_id' },
      warehouseId: { type: DataTypes.UUID, allowNull: true, field: 'warehouse_id' },
      // Работник, которому выдан экземпляр (документ "Выдача", Этап 8);
      // null, пока экземпляр на складе. Взаимоисключимо с warehouseId по
      // смыслу (либо на складе, либо у работника), но не проверяется
      // constraint-ом на уровне БД — гарантируется сервисами документов.
      employeeId: { type: DataTypes.UUID, allowNull: true, field: 'employee_id' },
      inventoryNumber: {
        type: DataTypes.STRING(64),
        allowNull: false,
        unique: true,
        field: 'inventory_number',
      },
      barcode: { type: DataTypes.STRING(64), allowNull: true, unique: true },
      status: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'in_stock' },
      condition: { type: DataTypes.STRING(32), allowNull: false, defaultValue: 'new' },
      cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      employeeCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true, field: 'employee_cost' },
      archivedAt: { type: DataTypes.DATE, allowNull: true, field: 'archived_at' },
    },
    {
      tableName: 'instances',
      defaultScope: { attributes: { exclude: ['cost', 'employeeCost'] } },
    },
  );
}
