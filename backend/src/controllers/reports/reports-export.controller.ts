import { Request, Response } from 'express';
import sql from 'mssql';
import { exportReport } from '../../services/reports/reports-export.service';
import { getUserDisplayName } from '../../repositories/reports/export-extras.repository';
import { getPool } from '../../config/db.config';
import { serverError, unauthorized } from '../../utils/response.util';
import { ExportRequestBody } from '../../validators/reports-export.validator';

async function writeAudit(
  userId: number,
  reportKey: string,
  format: string,
  sections: string[],
  operationStatus: 'Success' | 'Failure',
): Promise<void> {
  try {
    const pool = await getPool();
    const details = JSON.stringify({ format, sections }).slice(0, 500);
    await new sql.Request(pool)
      .input('userId', sql.Int, userId)
      .input('eventType', sql.VarChar(50), 'REPORT_EXPORT')
      .input('eventDescription', sql.VarChar(255), `Exported report: ${reportKey}`)
      .input('details', sql.VarChar(500), details)
      .input('operationStatus', sql.VarChar(20), operationStatus)
      .query(
        `INSERT INTO Audit_Log (user_id, event_type, event_description, details, operation_status)
         VALUES (@userId, @eventType, @eventDescription, @details, @operationStatus)`,
      );
  } catch (err) {
    console.error('[EXPORT AUDIT]', err);
  }
}

function safeFilename(reportKey: string, extension: string): string {
  const clean = reportKey.replace(/[^a-z0-9-]/gi, '-');
  const date = new Date().toISOString().slice(0, 10);
  return `${clean}-${date}.${extension}`;
}

export async function exportReportController(req: Request, res: Response): Promise<void> {
  const user = req.user;
  if (!user) {
    unauthorized(res);
    return;
  }

  const body = req.body as ExportRequestBody;
  const userId = user.userId;

  try {
    const generatedBy = await getUserDisplayName(userId);
    const { buffer, mimeType, extension, finalSections } = await exportReport(
      { reportKey: body.reportKey, format: body.format, sections: body.sections, filters: body.filters },
      generatedBy,
    );

    const filename = safeFilename(body.reportKey, extension);

    res.setHeader('Content-Type', mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    res.end(buffer);

    void writeAudit(userId, body.reportKey, body.format, finalSections, 'Success');
  } catch (err) {
    console.error('[EXPORT]', err);
    void writeAudit(userId, body.reportKey, body.format, body.sections ?? [], 'Failure');
    if (!res.headersSent) serverError(res, 'Export failed');
  }
}
