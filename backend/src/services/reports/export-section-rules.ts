import { ReportKey } from './report-data.registry';

interface SectionRule {
  validKeys: string[];
  requiredKeys: string[];
}

export const EXPORT_SECTION_RULES: Record<ReportKey, SectionRule> = {
  'new-patient-registrations': {
    validKeys: ['summary', 'chart', 'table'],
    requiredKeys: [],
  },
  'patient-demographics': {
    validKeys: ['summary', 'age-chart', 'gender-chart', 'table'],
    requiredKeys: [],
  },
  'attendance-no-show': {
    validKeys: ['summary', 'trend-chart', 'by-doctor', 'table'],
    requiredKeys: [],
  },
  'clinic-occupancy': {
    validKeys: ['summary', 'occupancy-chart', 'by-doctor', 'table'],
    requiredKeys: [],
  },
  'low-stock-items': {
    validKeys: ['summary', 'category-chart', 'table'],
    requiredKeys: ['table'],
  },
  'consumption': {
    validKeys: ['summary', 'trend-chart', 'category-chart', 'table'],
    requiredKeys: [],
  },
  'student-procedure-log': {
    validKeys: ['summary', 'trend-chart', 'by-student', 'table'],
    requiredKeys: [],
  },
  'supervisor-evaluation': {
    validKeys: ['summary', 'by-supervisor', 'by-student', 'table'],
    requiredKeys: [],
  },
};

export function resolveSections(reportKey: ReportKey, requested: string[]): string[] {
  const rule = EXPORT_SECTION_RULES[reportKey];
  if (!rule) return [];
  const validSet = new Set(rule.validKeys);
  const picked = new Set(requested.filter((k) => validSet.has(k)));
  for (const req of rule.requiredKeys) picked.add(req);
  return rule.validKeys.filter((k) => picked.has(k));
}
