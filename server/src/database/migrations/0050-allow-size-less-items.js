const TABLES = ['instances', 'receiving_lines', 'issuance_lines'];

export async function up({ context: sequelize }) {
  for (const table of TABLES) {
    await sequelize.query(`ALTER TABLE ${table} ALTER COLUMN size_id DROP NOT NULL`);
  }
}

export async function down({ context: sequelize }) {
  for (const table of TABLES) {
    await sequelize.query(`ALTER TABLE ${table} ALTER COLUMN size_id SET NOT NULL`);
  }
}
