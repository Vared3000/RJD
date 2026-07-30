import { DataTypes } from 'sequelize';

// Составной размер "одежда + рост" (см. HANDOFF.md) — модель одежды, для
// которой нужен и sizeType='clothing' размер, и рост одновременно (одна и
// та же "цифра" размера существует в нескольких вариантах роста).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addColumn('nomenclature_models', 'requires_height_size', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  });
}

export async function down({ context: sequelize }) {
  await sequelize.getQueryInterface().removeColumn('nomenclature_models', 'requires_height_size');
}
