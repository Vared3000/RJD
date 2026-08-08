import { DataTypes } from 'sequelize';

export function defineArchivePrintForm(sequelize) {
  return sequelize.define(
    'ArchivePrintForm',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      dpoId: { type: DataTypes.UUID, allowNull: false, field: 'dpo_id' },
      employeeId: { type: DataTypes.UUID, allowNull: false, field: 'employee_id' },
      documentType: { type: DataTypes.STRING(32), allowNull: false },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      instanceId: { type: DataTypes.UUID, allowNull: false, field: 'instance_id' },
      lineNumber: { type: DataTypes.INTEGER, allowNull: false },
      modelId: { type: DataTypes.UUID, allowNull: false, field: 'model_id' },
      sizeId: { type: DataTypes.UUID, allowNull: true, field: 'size_id' },
      heightSizeId: { type: DataTypes.UUID, allowNull: true, field: 'height_size_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
      cost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      employeeCost: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
      documentDate: { type: DataTypes.DATEONLY, allowNull: false, field: 'document_date' },
      postedAt: { type: DataTypes.DATE, allowNull: true, field: 'posted_at' },
      sourceTable: { type: DataTypes.STRING(32), allowNull: false, field: 'source_table' },
    },
    {
      tableName: 'archive_print_forms',
      indexes: [
        { fields: ['dpo_id'] },
        { fields: ['employee_id'] },
        { fields: ['document_type', 'document_id'] },
        { fields: ['instance_id'] },
        { fields: ['document_date'] },
        {
          unique: true,
          fields: ['dpo_id', 'employee_id', 'document_type', 'document_id', 'line_number'],
        },
      ],
    },
  );
}
