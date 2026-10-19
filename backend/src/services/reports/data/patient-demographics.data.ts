import * as patientRepo from '../../../repositories/reports/patient-reports.repository';
import * as extrasRepo from '../../../repositories/reports/export-extras.repository';
import { ReportDataset } from '../exporters/exporter.types';

function ageFromDob(dob: Date): number {
  const d = new Date(dob);
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age;
}

export async function fetchPatientDemographics(
  _filters: Record<string, unknown>,
  generatedBy: string,
): Promise<ReportDataset> {
  const [total, ages, genders, patients] = await Promise.all([
    patientRepo.getTotalPatients(),
    patientRepo.getAgeDistribution(),
    patientRepo.getGenderSplit(),
    extrasRepo.getAllPatientsDemographics(),
  ]);

  const male = genders.find((g) => g.gender === 'Male')?.count ?? 0;
  const female = genders.find((g) => g.gender === 'Female')?.count ?? 0;
  const sumAges = patients.reduce((acc, p) => acc + ageFromDob(p.date_of_birth), 0);
  const avgAge = patients.length > 0 ? +(sumAges / patients.length).toFixed(1) : 0;

  return {
    reportTitle: 'Patient Demographics',
    contextSubtitle: `Snapshot as of ${new Date().toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    })}`,
    generatedAt: new Date(),
    generatedBy,
    sections: {
      summary: {
        type: 'metrics',
        label: 'Summary',
        metrics: [
          { label: 'Total Patients', value: total },
          { label: 'Avg Age', value: avgAge },
          { label: 'Male / Female', value: `${male} / ${female}` },
        ],
      },
      'age-chart': {
        type: 'chart',
        label: 'Age Distribution',
        chartType: 'bar',
        data: {
          labels: ages.map((a) => a.ageGroup),
          datasets: [{ label: 'Patients', values: ages.map((a) => a.count) }],
        },
      },
      'gender-chart': {
        type: 'chart',
        label: 'Gender Distribution',
        chartType: 'pie',
        data: {
          labels: genders.map((g) => g.gender),
          datasets: [{ label: 'Patients', values: genders.map((g) => g.count) }],
        },
      },
      table: {
        type: 'table',
        label: 'Patients',
        columns: [
          { key: 'full_name', header: 'Name', width: 28 },
          { key: 'file_number', header: 'File No', width: 14 },
          { key: 'age', header: 'Age', width: 10 },
          { key: 'gender', header: 'Gender', width: 12 },
        ],
        rows: patients.map((p) => ({
          full_name: p.full_name,
          file_number: p.file_number,
          age: ageFromDob(p.date_of_birth),
          gender: p.gender,
        })),
      },
    },
  };
}
