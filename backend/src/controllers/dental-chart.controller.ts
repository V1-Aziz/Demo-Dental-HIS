import { Request, Response } from 'express';
import * as service from '../services/dental-chart.service';
import { success, created, notFound, badRequest, serverError } from '../utils/response.util';

export async function getByRecord(req: Request, res: Response): Promise<void> {
  try {
    const recordId = parseInt(req.params['recordId'], 10);
    const data = await service.getChartByRecord(recordId);
    success(res, data);
  } catch (err) {
    console.error('[dental-chart] getByRecord error:', err);
    serverError(res);
  }
}

export async function addNote(req: Request, res: Response): Promise<void> {
  try {
    const { recordId, toothNumber, toothNote, appointmentId } = req.body as {
      recordId:      number;
      toothNumber:   string;
      toothNote:     string;
      appointmentId?: number;
    };

    if (!recordId || !toothNumber || !toothNote) {
      badRequest(res, 'recordId, toothNumber, and toothNote are required');
      return;
    }

    const user = req.user!;
    const authoredByStudent = user.role === 'Student' ? user.academicId  : undefined;
    const authoredByDoctor  = user.role !== 'Student' ? user.employeeId  : undefined;

    const result = await service.addNote({
      recordId:     Number(recordId),
      toothNumber:  String(toothNumber),
      toothNote:    String(toothNote),
      appointmentId: appointmentId ? Number(appointmentId) : undefined,
      authoredByStudent,
      authoredByDoctor,
    });

    created(res, result, 'Dental chart note saved');
  } catch (err) {
    console.error('[dental-chart] addNote error:', err);
    serverError(res);
  }
}

export async function deleteNote(req: Request, res: Response): Promise<void> {
  try {
    const noteId = parseInt(req.params['noteId'], 10);
    await service.deleteNote(noteId);
    success(res, null, 'Note deleted');
  } catch (err) {
    console.error('[dental-chart] deleteNote error:', err);
    serverError(res);
  }
}
