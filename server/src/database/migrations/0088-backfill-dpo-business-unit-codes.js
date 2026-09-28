import { randomUUID } from 'node:crypto';

const MIGRATION_CHANGED_AT = '2026-09-29T00:00:00.000Z';

const BUSINESS_UNIT_CODES = [
  { code: '3530', names: ['Центральная'] },
  { code: '4421', names: ['Октябрьская'] },
  { code: '4422', names: ['Калининградская', 'Калининград'] },
  { code: '4423', names: ['Московская', 'Москва'] },
  { code: '4424', names: ['Горьковская'] },
  { code: '4425', names: ['Северная'] },
  { code: '4426', names: ['Северо-Кавказская'] },
  { code: '4427', names: ['Юго-Восточная'] },
  { code: '4428', names: ['Приволжская'] },
  { code: '4429', names: ['Куйбышевская'] },
  { code: '4430', names: ['Свердловская'] },
  { code: '4431', names: ['Южно-Уральская'] },
  { code: '4432', names: ['Западно-Сибирская'] },
  { code: '4433', names: ['Красноярская'] },
  { code: '4434', names: ['Восточно-Сибирская'] },
  { code: '4435', names: ['Забайкальская'] },
  { code: '4436', names: ['Дальневосточная'] },
];

export async function up({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    for (const { code, names } of BUSINESS_UNIT_CODES) {
      // Только полное нормализованное совпадение подтверждённого краткого
      // наименования. Частичный поиск здесь намеренно запрещён.
      const [matched] = await sequelize.query(
        `SELECT id, business_unit_code
         FROM dpos
         WHERE lower(btrim(name)) IN (:names)
           AND business_unit_code IS DISTINCT FROM :code
         FOR UPDATE`,
        {
          replacements: { code, names: names.map((name) => name.toLocaleLowerCase('ru-RU')) },
          transaction,
        },
      );
      for (const row of matched) {
        await sequelize.query(
          `INSERT INTO dpo_history
             (id, dpo_id, changed_at, changed_by_user_id, previous_data, created_at)
           VALUES
             (:id, :dpoId, :changedAt, NULL, CAST(:previousData AS jsonb), :changedAt)`,
          {
            replacements: {
              id: randomUUID(),
              dpoId: row.id,
              changedAt: MIGRATION_CHANGED_AT,
              previousData: JSON.stringify({ businessUnitCode: row.business_unit_code }),
            },
            transaction,
          },
        );
        await sequelize.query(
          `UPDATE dpos
           SET business_unit_code = :code, updated_at = NOW()
           WHERE id = :id`,
          { replacements: { code, id: row.id }, transaction },
        );
      }
    }
  });
}

export async function down({ context: sequelize }) {
  await sequelize.transaction(async (transaction) => {
    const [historyRows] = await sequelize.query(
      `SELECT dpo_id, previous_data
       FROM dpo_history
       WHERE changed_at = :changedAt AND changed_by_user_id IS NULL
         AND previous_data ? 'businessUnitCode'`,
      { replacements: { changedAt: MIGRATION_CHANGED_AT }, transaction },
    );
    for (const row of historyRows) {
      await sequelize.query(
        `UPDATE dpos
         SET business_unit_code = :code, updated_at = NOW()
         WHERE id = :id`,
        {
          replacements: { code: row.previous_data.businessUnitCode, id: row.dpo_id },
          transaction,
        },
      );
    }
    await sequelize.query(
      `DELETE FROM dpo_history
       WHERE changed_at = :changedAt AND changed_by_user_id IS NULL
         AND previous_data ? 'businessUnitCode'`,
      { replacements: { changedAt: MIGRATION_CHANGED_AT }, transaction },
    );
  });
}
