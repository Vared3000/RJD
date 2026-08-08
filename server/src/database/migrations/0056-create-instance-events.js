import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();
  await queryInterface.createTable('instance_events', {
    id: {
      type: DataTypes.UUID,
      allowNull: false,
      primaryKey: true,
      defaultValue: DataTypes.UUIDV4,
    },
    instance_id: {
      type: DataTypes.UUID,
      allowNull: false,
      references: { model: 'instances', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    event_type: { type: DataTypes.STRING(32), allowNull: false },
    from_status: { type: DataTypes.STRING(32), allowNull: true },
    to_status: { type: DataTypes.STRING(32), allowNull: true },
    from_condition: { type: DataTypes.STRING(32), allowNull: true },
    to_condition: { type: DataTypes.STRING(32), allowNull: true },
    from_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    to_warehouse_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'warehouses', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    from_employee_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    to_employee_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'employees', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    document_type: { type: DataTypes.STRING(32), allowNull: true },
    document_id: { type: DataTypes.UUID, allowNull: true },
    occurred_at: { type: DataTypes.DATE, allowNull: false },
    user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL',
    },
    details: { type: DataTypes.JSONB, allowNull: false, defaultValue: {} },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });

  await queryInterface.addIndex('instance_events', ['instance_id', 'occurred_at', 'created_at'], {
    name: 'instance_events_instance_timeline_idx',
  });
  await queryInterface.addIndex('instance_events', ['document_type', 'document_id'], {
    name: 'instance_events_document_idx',
  });
  await queryInterface.addIndex('instance_events', ['event_type'], {
    name: 'instance_events_event_type_idx',
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('instance_events');
}
