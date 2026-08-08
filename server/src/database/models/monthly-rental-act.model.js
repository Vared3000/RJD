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
    },
    { tableName: 'monthly_rental_acts' },
  );
}
