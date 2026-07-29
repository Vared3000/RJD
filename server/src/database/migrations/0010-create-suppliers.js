import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('suppliers', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    full_name: { type: DataTypes.STRING(500), allowNull: true },
    inn: { type: DataTypes.STRING(12), allowNull: true },
    kpp: { type: DataTypes.STRING(9), allowNull: true },
    address: { type: DataTypes.STRING(500), allowNull: true },
    contact_person: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    email: { type: DataTypes.STRING(255), allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('suppliers');
}
