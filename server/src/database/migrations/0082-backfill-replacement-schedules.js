// Уже выданные на момент обновления вещи тоже должны попасть в календарь
// замены. Для старой истории точного снимка норматива не существовало, поэтому
// однократно фиксируем действующий норматив комплекта должности. Берём только
// последнюю выдачу экземпляра, который прямо сейчас числится у работника.
export async function up({ context: sequelize }) {
  await sequelize.query(`
    WITH latest_issuance AS (
      SELECT DISTINCT ON (movement.instance_id)
             movement.id AS movement_id,
             movement.instance_id,
             movement.document_id,
             movement.from_warehouse_id,
             document.employee_id,
             document.document_date,
             instance.model_id,
             instance.size_id,
             instance.height_size_id,
             employee.position_id,
             employee.gender
      FROM stock_movements movement
      JOIN issuance_documents document
        ON document.id = movement.document_id
      JOIN instances instance
        ON instance.id = movement.instance_id
       AND instance.status = 'issued'
       AND instance.employee_id = document.employee_id
      JOIN employees employee
        ON employee.id = document.employee_id
       AND employee.archived_at IS NULL
       AND (employee.termination_date IS NULL OR employee.termination_date > CURRENT_DATE)
      WHERE movement.document_type = 'issuance'
      ORDER BY movement.instance_id, movement.occurred_at DESC, movement.created_at DESC, movement.id DESC
    ),
    candidates AS (
      SELECT latest.*,
             kit.service_life_years,
             (latest.document_date + make_interval(years => kit.service_life_years))::date
               AS planned_date
      FROM latest_issuance latest
      JOIN LATERAL (
        SELECT item.service_life_years
        FROM position_kit_items item
        WHERE item.position_id = latest.position_id
          AND item.model_id = latest.model_id
          AND item.archived_at IS NULL
          AND item.service_life_years > 0
          AND (item.gender IS NULL OR latest.gender IS NULL OR item.gender = latest.gender)
        ORDER BY
          CASE WHEN latest.gender IS NOT NULL AND item.gender = latest.gender THEN 0 ELSE 1 END,
          item.service_life_years ASC,
          item.created_at ASC,
          item.id ASC
        LIMIT 1
      ) kit ON TRUE
    ),
    updated_movements AS (
      UPDATE stock_movements movement
      SET service_life_years_snapshot = candidates.service_life_years,
          planned_replacement_date = candidates.planned_date
      FROM candidates
      WHERE movement.id = candidates.movement_id
      RETURNING movement.id
    )
    INSERT INTO issuance_tasks (
      id,
      source_document_id,
      task_type,
      source_movement_id,
      source_instance_id,
      employee_id,
      warehouse_id,
      model_id,
      size_id,
      height_size_id,
      quantity,
      status,
      issued_at,
      service_life_years_snapshot,
      planned_replacement_date,
      notification_date,
      created_at,
      updated_at
    )
    SELECT
      gen_random_uuid(),
      candidates.document_id,
      'replacement',
      candidates.movement_id,
      candidates.instance_id,
      candidates.employee_id,
      candidates.from_warehouse_id,
      candidates.model_id,
      candidates.size_id,
      candidates.height_size_id,
      1,
      CASE
        WHEN candidates.planned_date < CURRENT_DATE THEN 'overdue'
        WHEN candidates.planned_date = CURRENT_DATE THEN 'open'
        ELSE 'scheduled'
      END,
      candidates.document_date,
      candidates.service_life_years,
      candidates.planned_date,
      (candidates.planned_date - INTERVAL '1 month')::date,
      NOW(),
      NOW()
    FROM candidates
    WHERE candidates.from_warehouse_id IS NOT NULL
    ON CONFLICT (source_movement_id) DO NOTHING
  `);
}

// Бэкофилл фиксирует исторический снимок. При откате следующая миграция 0081
// удалит добавленные колонки и связанные задачи; отдельно стирать историю
// здесь опасно, потому что после установки могли появиться новые выдачи.
export async function down() {}
