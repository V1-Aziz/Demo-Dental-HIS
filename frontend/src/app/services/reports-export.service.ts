import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';
import { ExportRequest } from '../shared/export-modal/report-exports.config';

@Injectable({ providedIn: 'root' })
export class ReportsExportService {
  private readonly endpoint = `${environment.apiUrl}/reports/export`;

  constructor(private http: HttpClient) {}

  export(req: ExportRequest): Promise<Blob> {
    return firstValueFrom(
      this.http.post(this.endpoint, req, { responseType: 'blob' }),
    );
  }
}
