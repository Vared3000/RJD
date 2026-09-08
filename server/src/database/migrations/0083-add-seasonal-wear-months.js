import { DataTypes } from 'sequelize';

const ALL_MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const ALL_MONTHS_SQL = `ARRAY[${ALL_MONTHS.join(', ')}]::smallint[]`;

function validMonthsConstraint(column, { nullable = false } = {}) {
  const presenceCount = ALL_MONTHS.map(
    (month) => `((${column} @> ARRAY[${month}]::smallint[])::integer)`,
  ).join(' + ');
  const condition = [
    `array_ndims(${column}) = 1`,
    `cardinality(${column}) BETWEEN 1 AND 12`,
    `${column} <@ ${ALL_MONTHS_SQL}`,
    `cardinality(${column}) = (${presenceCount})`,
  ].join(' AND ');
  return nullable ? `${column} IS NULL OR (${condition})` : condition;
}

// Месяцы носки задаются в карточке модели, а в проведённой выдаче хранится
// снимок. Благодаря этому правка справочника действует только на будущие
// выдачи и не переписывает исторические данные.
export async function up({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await sequelize.transaction(async (transaction) => {
    await queryInterface.addColumn(
      'nomenclature_models',
      'wear_months',
      {
        type: DataTypes.ARRAY(DataTypes.SMALLINT),
        allowNull: false,
        defaultValue: ALL_MONTHS,
      },
      { transaction },
    );
    await queryInterface.addColumn(
      'stock_movements',
      'wear_months_snapshot',
      {
        type: DataTypes.ARRAY(DataTypes.SMALLINT),
        allowNull: true,
      },
      { transaction },
    );

    await sequelize.query(
      `ALTER TABLE nomenclature_models
       ADD CONSTRAINT nomenclature_models_wear_months_valid
       CHECK (${validMonthsConstraint('wear_months')})`,
      { transaction },
    );
    await sequelize.query(
      `ALTER TABLE stock_movements
       ADD CONSTRAINT stock_movements_wear_months_snapshot_valid
       CHECK (${validMonthsConstraint('wear_months_snapshot', { nullable: true })})`,
      { transaction },
    );

    // До появления настройки вся номенклатура считалась круглогодичной.
    await sequelize.query(
      `UPDATE stock_movements
       SET wear_months_snapshot = ${ALL_MONTHS_SQL}
       WHERE document_type = 'issuance'
         AND wear_months_snapshot IS NULL`,
      { transaction },
    );
  });
}

export async function down({ context: sequelize }) {
  const queryInterface = sequelize.getQueryInterface();

  await sequelize.transaction(async (transaction) => {
    await queryInterface.removeConstraint(
      'stock_movements',
      'stock_movements_wear_months_snapshot_valid',
      { transaction },
    );
    await queryInterface.removeConstraint(
      'nomenclature_models',
      'nomenclature_models_wear_months_valid',
      { transaction },
    );
    await queryInterface.removeColumn('stock_movements', 'wear_months_snapshot', { transaction });
    await queryInterface.removeColumn('nomenclature_models', 'wear_months', { transaction });
  });
}
