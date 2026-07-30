import { DataTypes } from 'sequelize';

// Вторая (необязательная) ось размера — рост — для позиций, где
// NomenclatureModel.requiresHeightSize=true (см. миграцию 0043). Экземпляр/
// строки поступления/выдачи должны иметь возможность зафиксировать рост в
// дополнение к основному sizeId. ReturnLine/TransferLine/WriteoffLine/
// RepairLine/LaundryLine не трогаем — они ссылаются на уже известный
// instanceId, размер там не нужен.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  for (const table of ['instances', 'receiving_lines', 'issuance_lines']) {
    await qi.addColumn(table, 'height_size_id', {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'sizes', key: 'id' },
      onDelete: 'RESTRICT',
    });
  }
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeColumn('instances', 'height_size_id');
  await qi.removeColumn('receiving_lines', 'height_size_id');
  await qi.removeColumn('issuance_lines', 'height_size_id');
}
