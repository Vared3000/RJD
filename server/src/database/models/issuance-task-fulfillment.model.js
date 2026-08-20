import { DataTypes } from 'sequelize';

// Неизменяемый журнал закрытий задач на доукомплектовку (Релиз Д) — одна
// строка на "этот документ закрыл столько-то из потребности этой задачи".
// Задача может закрываться несколькими документами со временем (частичная
// довыдача), поэтому это отдельная таблица, а не единственное поле на
// IssuanceTask.
export function defineIssuanceTaskFulfillment(sequelize) {
  return sequelize.define(
    'IssuanceTaskFulfillment',
    {
      id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
      taskId: { type: DataTypes.UUID, allowNull: false, field: 'task_id' },
      documentId: { type: DataTypes.UUID, allowNull: false, field: 'document_id' },
      quantity: { type: DataTypes.INTEGER, allowNull: false },
    },
    { tableName: 'issuance_task_fulfillments', updatedAt: false },
  );
}
