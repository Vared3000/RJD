import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable('source_import_records', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    source_key: { type: DataTypes.STRING(64), allowNull: false, unique: true },
    source_file: { type: DataTypes.TEXT, allowNull: false },
    file_hash: { type: DataTypes.STRING(64), allowNull: false },
    record_type: { type: DataTypes.STRING(32), allowNull: false },
    sheet_name: { type: DataTypes.STRING(255), allowNull: true },
    page_number: { type: DataTypes.INTEGER, allowNull: true },
    row_number: { type: DataTypes.INTEGER, allowNull: true },
    payload: { type: DataTypes.JSONB, allowNull: false },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('source_import_records', ['source_file']);
  await qi.addIndex('source_import_records', ['record_type']);

  await qi.createTable('nomenclature_prices', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'nomenclature_models', key: 'id' },
      onDelete: 'CASCADE',
    },
    dpo_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'dpos', key: 'id' },
      onDelete: 'SET NULL',
    },
    source_record_id: {
      type: DataTypes.UUID,
      allowNull: false,
      unique: true,
      references: { model: 'source_import_records', key: 'id' },
      onDelete: 'CASCADE',
    },
    effective_date: { type: DataTypes.DATEONLY, allowNull: true },
    price_without_vat: { type: DataTypes.DECIMAL(14, 4), allowNull: false },
    vat_rate: { type: DataTypes.DECIMAL(7, 4), allowNull: true },
    price_with_vat: { type: DataTypes.DECIMAL(14, 4), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('nomenclature_prices', ['model_id', 'effective_date']);
  await qi.addIndex('nomenclature_prices', ['dpo_id']);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.dropTable('nomenclature_prices');
  await qi.dropTable('source_import_records');
}
