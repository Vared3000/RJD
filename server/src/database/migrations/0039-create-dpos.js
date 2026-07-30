import { DataTypes } from 'sequelize';

// ДПО (Дирекция пассажирских обустройств, раздел 10 ТЗ) — региональные
// структурные подразделения заказчика (ОАО «РЖД»), на каждое из которых
// оформляются ежемесячные акты. Полный CRUD с историей изменений (см.
// 0040-create-dpo-history.js) — контрактные реквизиты (доп. соглашение,
// ответственное лицо) периодически обновляются, важно знать, какие из них
// действовали в конкретном историческом периоде.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();

  await qi.createTable('dpos', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    name: { type: DataTypes.STRING(255), allowNull: false, unique: true },
    full_name: { type: DataTypes.STRING(500), allowNull: false },
    code: { type: DataTypes.STRING(32), allowNull: true, unique: true },
    address: { type: DataTypes.STRING(500), allowNull: true },
    okpo: { type: DataTypes.STRING(16), allowNull: true },
    business_unit_code: { type: DataTypes.STRING(32), allowNull: true },
    director_full_name: { type: DataTypes.STRING(255), allowNull: true },
    director_basis: { type: DataTypes.STRING(500), allowNull: true },
    contract_number: { type: DataTypes.STRING(128), allowNull: true },
    contract_date: { type: DataTypes.DATEONLY, allowNull: true },
    additional_agreement_number: { type: DataTypes.STRING(128), allowNull: true },
    additional_agreement_date: { type: DataTypes.DATEONLY, allowNull: true },
    archived_at: { type: DataTypes.DATE, allowNull: true },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('dpos');
}
