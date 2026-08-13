import { DataTypes } from 'sequelize';

export function defineMonthlyRentalAct(sequelize) {
  return sequelize.define(
    'MonthlyRentalAct',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      dpoId: { type: DataTypes.UUID, allowNull: false, field: 'dpo_id' },
      reportMonth: { type: DataTypes.DATEONLY, allowNull: false, field: 'report_month' },
      snapshot: { type: DataTypes.JSONB, allowNull: false },
      generatedAt: { type: DataTypes.DATE, allowNull: false, field: 'generated_at' },
      generatedByUserId: {
        type: DataTypes.UUID,
        allowNull: true,
        field: 'generated_by_user_id',
      },
      isStale: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
        field: 'is_stale',
      },
      staleReason: { type: DataTypes.STRING(255), allowNull: true, field: 'stale_reason' },
      staleAt: { type: DataTypes.DATE, allowNull: true, field: 'stale_at' },
    },
    { tableName: 'monthly_rental_acts' },
  );
}
