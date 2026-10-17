import type { Request, Response } from "express";
import { AuditService } from "./audit.service.js";

export class AdminAuditController {
  /**
   * GET /api/v1/admin/audit-logs
   * Query immutable admin audit logs
   */
  static async getAuditLogs(req: Request, res: Response) {
    try {
      const { adminId, action, page = "1", limit = "20" } = req.query;

      const pageNumber = Math.max(1, parseInt(page as string, 10) || 1);
      const pageSize = Math.min(
        100,
        Math.max(1, parseInt(limit as string, 10) || 20),
      );

      const result = await AuditService.getAuditLogs({
        ...(typeof adminId === "string" && adminId.trim()
          ? { adminId: adminId.trim() }
          : {}),
        ...(typeof action === "string" && action.trim()
          ? { action: action.trim() }
          : {}),
        page: pageNumber,
        limit: pageSize,
      });

      return res.status(200).json({
        message: "Audit logs retrieved successfully.",
        data: {
          logs: result.logs,
          pagination: {
            total: result.total,
            page: pageNumber,
            limit: pageSize,
            totalPages: Math.ceil(result.total / pageSize),
          },
        },
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Get Audit Logs Error:", errorMessage);
      return res.status(500).json({ error: "Failed to retrieve audit logs." });
    }
  }

  /**
   * GET /api/v1/admin/ledger-summary
   * View financial ledger totals and wallet liabilities
   */
  static async getLedgerSummary(_req: Request, res: Response) {
    try {
      const summary = await AuditService.getLedgerSummary();

      return res.status(200).json({
        message: "Ledger reconciliation summary retrieved successfully.",
        data: summary,
      });
    } catch (error: unknown) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown error";
      console.error("Ledger Summary Error:", errorMessage);
      return res
        .status(500)
        .json({ error: "Failed to generate ledger reconciliation summary." });
    }
  }
}
