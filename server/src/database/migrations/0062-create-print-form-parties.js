import { DataTypes } from 'sequelize';

export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.createTable('print_form_parties', {
    id: { type: DataTypes.UUID, defaultValue: DataTypes.UUIDV4, primaryKey: true },
    role: { type: DataTypes.STRING(16), allowNull: false },
    effective_date: { type: DataTypes.DATEONLY, allowNull: false },
    full_name: { type: DataTypes.TEXT, allowNull: false },
    short_name: { type: DataTypes.STRING(255), allowNull: false },
    inn: { type: DataTypes.STRING(12), allowNull: false },
    kpp: { type: DataTypes.STRING(9), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: false },
    okpo: { type: DataTypes.STRING(10), allowNull: true },
    director_full_name: { type: DataTypes.STRING(255), allowNull: false },
    director_position: { type: DataTypes.STRING(255), allowNull: false },
    director_basis: { type: DataTypes.STRING(255), allowNull: false },
    bank_name: { type: DataTypes.TEXT, allowNull: true },
    bik: { type: DataTypes.STRING(9), allowNull: true },
    correspondent_account: { type: DataTypes.STRING(20), allowNull: true },
    settlement_account: { type: DataTypes.STRING(20), allowNull: true },
    contract_number: { type: DataTypes.STRING(255), allowNull: true },
    contract_date: { type: DataTypes.DATEONLY, allowNull: true },
    created_by_user_id: {
      type: DataTypes.UUID,
      allowNull: true,
      references: { model: 'users', key: 'id' },
      onDelete: 'SET NULL',
    },
    created_at: { type: DataTypes.DATE, allowNull: false },
    updated_at: { type: DataTypes.DATE, allowNull: false },
  });
  await qi.addConstraint('print_form_parties', {
    fields: ['role'],
    type: 'check',
    where: { role: ['executor', 'customer'] },
    name: 'chk_print_form_parties_role',
  });
  await qi.addIndex('print_form_parties', ['role', 'effective_date'], {
    unique: true,
    name: 'uq_print_form_parties_role_date',
  });

  await sequelize.query(`
    INSERT INTO print_form_parties (
      id, role, effective_date, full_name, short_name, inn, kpp, address, okpo,
      director_full_name, director_position, director_basis, created_at, updated_at
    ) VALUES
    (
      '00000000-0000-4000-8000-000000000131', 'executor', '2000-01-01',
      'Общество с ограниченной ответственностью «Лазурит»', 'ООО «Лазурит»',
      '7820046397', '470501001',
      '188309, Ленинградская область, м.р-н Гатчинский, г.п. Гатчинское, г. Гатчина, ул. Новосёлов, дом 7А, помещ. 52',
      '31078898', 'Просовикова Наталья Сергеевна', 'Генеральный директор', 'Устава',
      NOW(), NOW()
    ),
    (
      '00000000-0000-4000-8000-000000000132', 'customer', '2000-01-01',
      'Открытое акционерное общество «Российские железные дороги»', 'ОАО «РЖД»',
      '7708503727', '997650001',
      '107174, г. Москва, вн.тер.г. муниципальный округ Басманный, ул. Новая Басманная, д. 2/1, стр. 1',
      '00083262', 'Руководитель ОАО «РЖД»', 'Руководитель', 'Устава',
      NOW(), NOW()
    )
  `);
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().dropTable('print_form_parties');
}
