import { DataTypes } from 'sequelize';

// Задача 22: номер редакции для аудита (не для конкурентности — та уже
// закрыта пессимистической блокировкой шапки, см. задачу 4 и
// docs/architecture.md).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  for (const table of ['receiving_documents', 'issuance_documents']) {
    await qi.addColumn(table, 'revision_number', {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 1,
    });
    await qi.addColumn(table, 'last_revised_at', { type: DataTypes.DATE, allowNull: true });
    await qi.addColumn(table, 'last_revised_by_user_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'RESTRICT',
    });
  }
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  for (const table of ['receiving_documents', 'issuance_documents']) {
    await qi.removeColumn(table, 'last_revised_by_user_id');
    await qi.removeColumn(table, 'last_revised_at');
    await qi.removeColumn(table, 'revision_number');
  }
}
