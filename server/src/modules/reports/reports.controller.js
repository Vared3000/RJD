import { reportsService } from './reports.service.js';
import { success } from '../../utils/respond.js';
import { reportExportService } from './report-export.service.js';

function respond(res, { rows, totals, from, to }) {
  const meta = { totals };
  if (from) meta.from = from;
  if (to) meta.to = to;
  return success(res, rows, 200, meta);
}

export const reportsController = {
  async export(req, res) {
    const file = await reportExportService.generate(req.params.report, req.query);
    res.setHeader('Content-Type', file.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${file.fileName}"`);
    res.setHeader('Content-Length', file.buffer.length);
    return res.send(file.buffer);
  },
  async stockBalances(req, res) {
    respond(res, await reportsService.stockBalances(req.query));
  },
  async propertyCost(req, res) {
    respond(res, await reportsService.propertyCost(req.query));
  },
  async purchases(req, res) {
    respond(res, await reportsService.purchases(req.query));
  },
  async suppliers(req, res) {
    respond(res, await reportsService.suppliers(req.query));
  },
  async writeoffs(req, res) {
    respond(res, await reportsService.writeoffs(req.query));
  },
  async repairs(req, res) {
    respond(res, await reportsService.repairs(req.query));
  },
  async warehouses(req, res) {
    respond(res, await reportsService.warehouses(req.query));
  },
  async employees(req, res) {
    respond(res, await reportsService.employees(req.query));
  },
  async dpo(req, res) {
    respond(res, await reportsService.dpo(req.query));
  },
  async turnover(req, res) {
    const result = await reportsService.turnover(req.query);
    return success(res, result.rows, 200, {
      totals: result.totals,
      from: result.from,
      to: result.to,
      groupBy: result.groupBy,
      groupByLabel: result.groupByLabel,
      filtersText: result.filtersText,
      formulaText: result.formulaText,
      positionNote: result.positionNote,
      incompleteHireCount: result.incompleteHireCount,
      generatedAt: result.generatedAt,
    });
  },
};
