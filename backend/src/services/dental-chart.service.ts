import * as repo from '../repositories/dental-chart.repository';

export async function getChartByRecord(recordId: number): Promise<unknown[]> {
  return repo.getDentalChartByRecord(recordId);
}

export async function addNote(data: {
  recordId:           number;
  toothNumber:        string;
  toothNote:          string;
  authoredByStudent?: number;
  authoredByDoctor?:  number;
  appointmentId?:     number;
}): Promise<{ note_id: number }> {
  return repo.addDentalChartNote(data);
}

export async function deleteNote(noteId: number): Promise<void> {
  return repo.deleteDentalChartNote(noteId);
}
