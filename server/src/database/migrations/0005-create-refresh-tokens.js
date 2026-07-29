import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('refresh_tokens', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    user_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'users', key: 'id' },
      onDelete: 'CASCADE',
    },
    token_hash: { type: DataTypes.STRING(255), allowNull: false },
    expires_at: { type: DataTypes.DATE, allowNull: false },
    revoked_at: { type: DataTypes.DATE, allowNull: true },
    replaced_by_id: { type: DataTypes.UUID, allowNull: true },
    created_by_ip: { type: DataTypes.STRING(64), allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addIndex('refresh_tokens', ['user_id']);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('refresh_tokens');
}
