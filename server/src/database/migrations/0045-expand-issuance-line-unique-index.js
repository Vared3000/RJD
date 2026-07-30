// После появления второй оси размера (роста) две строки одной модели и
// основного размера могут отличаться ростом. Старый индекс из 0027 этого не
// позволял, поэтому заменяем его на составной индекс с NULLS NOT DISTINCT:
// строки без роста по-прежнему не дублируются, а разные роста различаются.
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeIndex('issuance_lines', 'issuance_lines_document_id_model_id_size_id_unique');
  await sequelize.query(`
    CREATE UNIQUE INDEX issuance_lines_document_model_size_height_unique
      ON issuance_lines (document_id, model_id, size_id, height_size_id)
      NULLS NOT DISTINCT
  `);
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeIndex('issuance_lines', 'issuance_lines_document_model_size_height_unique');
  await qi.addIndex('issuance_lines', ['document_id', 'model_id', 'size_id'], {
    unique: true,
    name: 'issuance_lines_document_id_model_id_size_id_unique',
  });
}
