// Известный дефект Этапа 8 (см. HANDOFF.md): ничто не мешало добавить в
// документ две строки Выдачи с одинаковыми model_id+size_id (или две строки
// Возврата с одинаковым instance_id) — при проведении вторая строка забирала
// те же ещё не помеченные "issued" экземпляры повторно (SKIP LOCKED
// защищает только от параллельных транзакций, не от повторного SELECT внутри
// одной и той же). Уникальный индекс — граница на уровне БД, дублирующая
// проверку на уровне сервиса (issuance.service.js/return.service.js).
export async function up({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.addIndex('issuance_lines', ['document_id', 'model_id', 'size_id'], {
    unique: true,
    name: 'issuance_lines_document_id_model_id_size_id_unique',
  });
  await qi.addIndex('return_lines', ['document_id', 'instance_id'], {
    unique: true,
    name: 'return_lines_document_id_instance_id_unique',
  });
}

export async function down({ context: sequelize }) {
  const qi = sequelize.getQueryInterface();
  await qi.removeIndex('issuance_lines', 'issuance_lines_document_id_model_id_size_id_unique');
  await qi.removeIndex('return_lines', 'return_lines_document_id_instance_id_unique');
}
