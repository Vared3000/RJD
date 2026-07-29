import { DataTypes } from 'sequelize';

export function defineRefreshToken(sequelize) {
  return sequelize.define(
    'RefreshToken',
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        field: 'user_id',
      },
      tokenHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        field: 'token_hash',
      },
      expiresAt: {
        type: DataTypes.DATE,
        allowNull: false,
        field: 'expires_at',
      },
      revokedAt: {
        type: DataTypes.DATE,
        allowNull: true,
        field: 'revoked_at',
      },
      replacedById: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'replaced_by_id',
      },
      createdByIp: {
        type: DataTypes.STRING(64),
        allowNull: true,
        field: 'created_by_ip',
      },
    },
    {
      tableName: 'refresh_tokens',
      updatedAt: false,
    },
  );
}
