import { Component, OnInit } from '@angular/core';
import { AcademicService } from '../../../services/academic.service';

interface GradeRecord {
  grade_id:        number;
  submission_type: 'Diagnosis' | 'Treatment';
  submission_id:   number;
  procedure_label: string;
  patient_name:    string;
  patient_file_no: number;
  submitted_at:    string;
  grade:           number;
  feedback_note:   string | null;
  graded_at:       string;
}

@Component({
  standalone: false,
  selector: 'app-student-grades',
  templateUrl: './student-grades.component.html',
  styleUrls: ['./student-grades.component.scss'],
})
export class StudentGradesComponent implements OnInit {
  grades: GradeRecord[]  = [];
  ungradedApprovedCount  = 0;
  loading                = false;

  get averageGrade(): number | null {
    if (!this.grades.length) return null;
    const sum = this.grades.reduce((acc, g) => acc + g.grade, 0);
    return Math.round((sum / this.grades.length) * 10) / 10;
  }

  constructor(private academicService: AcademicService) {}

  ngOnInit(): void {
    this.loading = true;
    this.academicService.getMyGrades().subscribe({
      next: (res: any) => {
        this.grades               = res.data?.grades ?? [];
        this.ungradedApprovedCount = res.data?.ungradedApprovedCount ?? 0;
        this.loading              = false;
      },
      error: () => { this.loading = false; },
    });
  }

  gradeColors(grade: number | null): { bg: string; text: string; border: string } {
    if (grade === null) return { bg: '#f3f4f6', text: '#9ca3af', border: '#e5e7eb' };
    if (grade >= 8)    return { bg: '#eaf3de', text: '#3b6d11', border: '#c0dd97' };
    if (grade >= 6)    return { bg: '#faeeda', text: '#854f0b', border: '#fac775' };
    return                    { bg: '#fcebeb', text: '#a32d2d', border: '#f7c1c1' };
  }

  avgColors(): { bg: string; text: string; border: string } {
    return this.gradeColors(this.averageGrade);
  }

  typeClass(type: 'Diagnosis' | 'Treatment'): string {
    return type === 'Diagnosis'
      ? 'bg-blue-50 text-blue-700 border border-blue-200'
      : 'bg-purple-50 text-purple-700 border border-purple-200';
  }

  formatDate(iso: string): string {
    return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
  }
}
