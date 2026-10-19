import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../environments/environment';

@Injectable({ providedIn: 'root' })
export class AcademicService {
  private base = `${environment.apiUrl}/academic`;

  constructor(private http: HttpClient) {}

  // ─── Doctor ────────────────────────────────────────────────────────────────

  getPendingReviews(filter: 'pending' | 'revision' | 'decided' | 'all' = 'pending'): Observable<any> {
    return this.http.get(`${this.base}/pending-reviews`, { params: { filter } });
  }

  getReviewQueueStats(): Observable<any> {
    return this.http.get(`${this.base}/review-queue-stats`);
  }

  getReviewDetail(type: 'Diagnosis' | 'Treatment', id: number): Observable<any> {
    return this.http.get(`${this.base}/review/${type}/${id}`);
  }

  submitReview(
    type: 'Diagnosis' | 'Treatment',
    id: number,
    action: 'approve' | 'request_revision' | 'reject',
    feedback?: string,
  ): Observable<any> {
    return this.http.patch(`${this.base}/review/${type}/${id}`, { action, feedback });
  }

  // ─── Student ───────────────────────────────────────────────────────────────

  getMySubmissions(): Observable<any> {
    return this.http.get(`${this.base}/my-submissions`);
  }

  resubmitNote(type: 'Diagnosis' | 'Treatment', id: number, fields: Record<string, string>): Observable<any> {
    return this.http.patch(`${this.base}/resubmit/${type}/${id}`, fields);
  }

  withdrawSubmission(type: 'Diagnosis' | 'Treatment', id: number): Observable<any> {
    return this.http.delete(`${this.base}/submission/${type}/${id}`);
  }

  // ─── Grades ────────────────────────────────────────────────────────────────

  submitGrade(
    submissionType: 'Diagnosis' | 'Treatment',
    submissionId:   number,
    studentId:      number,
    grade:          number,
    feedbackNote?:  string,
  ): Observable<any> {
    return this.http.post(`${this.base}/grades`, { submissionType, submissionId, studentId, grade, feedbackNote });
  }

  getStudentGrades(studentId: number): Observable<any> {
    return this.http.get(`${this.base}/grades/student/${studentId}`);
  }

  getGradeSummary(): Observable<any> {
    return this.http.get(`${this.base}/grades/summary`);
  }

  getMyGrades(): Observable<any> {
    return this.http.get(`${this.base}/grades/my`);
  }
}
