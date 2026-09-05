import test from 'node:test';
import assert from 'node:assert/strict';
import {
  daysUntil,
  plannedReplacementDate,
  replacementNotificationDate,
  replacementStatusForDate,
} from '../modules/issuance/tasks/replacement-dates.js';

test('плановая замена сохраняет календарную дату и уведомляет ровно за месяц', () => {
  const replacement = plannedReplacementDate('2024-02-29', 1);
  assert.equal(replacement, '2025-02-28');
  assert.equal(replacementNotificationDate(replacement), '2025-01-28');
});

test('статус замены меняется в дату срока и становится просроченным на следующий день', () => {
  assert.equal(replacementStatusForDate('2026-10-03', '2026-09-03'), 'scheduled');
  assert.equal(replacementStatusForDate('2026-09-03', '2026-09-03'), 'open');
  assert.equal(replacementStatusForDate('2026-09-02', '2026-09-03'), 'overdue');
  assert.equal(daysUntil('2026-10-03', '2026-09-03'), 30);
});
