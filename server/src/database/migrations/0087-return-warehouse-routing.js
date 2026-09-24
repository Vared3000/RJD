import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await sequelize.transaction(async (transaction) => {
    await qi.addColumn(
      'warehouses',
      'is_primary_for_returns',
      {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      },
      { transaction },
    );
    // Однократная совместимость с существующими данными. Только однозначный
    // Основной в организации; при неоднозначности назначение делает администратор.
    // После миграции маршрутизация работает по признаку/ID, не по названию.
    await sequelize.query(
      `UPDATE warehouses SET is_primary_for_returns = true
      WHERE archived_at IS NULL AND lower(btrim(name)) = 'основной'
      AND organization_id IN (SELECT organization_id FROM warehouses
        WHERE archived_at IS NULL AND lower(btrim(name)) = 'основной'
        GROUP BY organization_id HAVING count(*) = 1)`,
      { transaction },
    );
    await sequelize.query(
      `CREATE UNIQUE INDEX warehouses_one_primary_return_idx
      ON warehouses (organization_id) WHERE is_primary_for_returns AND archived_at IS NULL`,
      { transaction },
    );
    await qi.addColumn(
      'return_lines',
      'target_warehouse_id',
      {
        type: DataTypes.UUID,
        allowNull: true,
        references: { model: 'warehouses', key: 'id' },
        onDelete: 'RESTRICT',
      },
      { transaction },
    );
    // Исторические возвраты не перемещаем: сохраняем прежнее назначение.
    await sequelize.query(
      `UPDATE return_lines l SET target_warehouse_id = d.warehouse_id
      FROM return_documents d WHERE d.id=l.document_id AND d.status='posted'`,
      { transaction },
    );
  });
}

export async function down({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    await sequelize
      .getQueryInterface()
      .removeColumn('return_lines', 'target_warehouse_id', { transaction });
    await sequelize
      .getQueryInterface()
      .removeColumn('warehouses', 'is_primary_for_returns', { transaction });
  });
}
