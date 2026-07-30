import { DataTypes } from 'sequelize';

// Комплект по должности (раздел 9 ТЗ) — какие модели и в каком количестве
// полагаются работнику на данной должности. Используется при автоподборе
// комплекта в документе "Выдача" (Этап 8): размер берётся не отсюда, а из
// карточки работника — по полю nomenclature_models.size_type.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('position_kit_items', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    position_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'positions', key: 'id' },
      onDelete: 'RESTRICT',
    },
    model_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'nomenclature_models', key: 'id' },
      onDelete: 'RESTRICT',
    },
    quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('position_kit_items', ['position_id', 'model_id'], {
    unique: true,
    name: 'position_kit_items_position_id_model_id_unique',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('position_kit_items');
}
