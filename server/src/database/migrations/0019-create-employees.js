import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('employees', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    organization_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'organizations', key: 'id' },
      onDelete: 'RESTRICT',
    },
    subdivision_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'subdivisions', key: 'id' },
      onDelete: 'RESTRICT',
    },
    position_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'positions', key: 'id' },
      onDelete: 'RESTRICT',
    },
    full_name: { type: DataTypes.STRING(255), allowNull: false },
    personnel_number: { type: DataTypes.STRING(64), allowNull: true, unique: true },
    birth_date: { type: DataTypes.DATEONLY, allowNull: true },
    hire_date: { type: DataTypes.DATEONLY, allowNull: false },
    termination_date: { type: DataTypes.DATEONLY, allowNull: true },
    clothing_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    height_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    shoe_size_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    },
    phone: { type: DataTypes.STRING(32), allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('employees');
}
