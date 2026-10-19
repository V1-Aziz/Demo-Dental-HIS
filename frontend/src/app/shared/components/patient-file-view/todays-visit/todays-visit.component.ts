import { Component, Input, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { PatientFileService } from '../../../../services/patient-file.service';
import { DentalChartService } from '../../../../services/dental-chart.service';
import { LookupPublicService } from '../../../../services/lookup-public.service';
import { environment } from '../../../../../environments/environment';

interface TodaysAppt {
  appointment_id:   number;
  appointment_time: string;
  appointment_type: string;
  doctor_name:      string;
  clinic_name:      string;
  status:           'Scheduled' | 'In Progress';
}

interface Procedure {
  diagnosis:            string;
  treatment:            string;
  clinicalFindings:     string;
  radiographicFindings: string;
}

interface ToothEntry {
  toothNumber: number;
  procedures:  Procedure[];
}

function emptyProc(): Procedure {
  return { diagnosis: '', treatment: '', clinicalFindings: '', radiographicFindings: '' };
}

@Component({
  standalone: true,
  imports:    [CommonModule, FormsModule],
  selector:   'app-todays-visit',
  template: `
<div class="tv-wrapper">

  <!-- Loading -->
  <div *ngIf="loading()" class="loading-text">Loading today's visits…</div>

  <!-- No appointments -->
  <div *ngIf="!loading() && appointments().length === 0" class="empty-state-card">
    <div class="empty-icon">📅</div>
    <h4>No active visit</h4>
    <p>The patient must be checked in at reception before clinical entries can be added.</p>
  </div>

  <ng-container *ngIf="!loading() && appointments().length > 0">

    <!-- Picker (2+ appointments) -->
    <ng-container *ngIf="appointments().length >= 2">
      <div class="picker-label">Select which of today's appointments you're recording for</div>
      <div class="picker-grid">
        <button *ngFor="let a of appointments()" type="button" class="visit-card"
                [class.selected]="selectedId() === a.appointment_id"
                (click)="requestSelect(a.appointment_id)">
          <div class="card-top">
            <span class="card-time">{{ a.appointment_time }}</span>
            <span class="status-pill" [ngClass]="'st-' + statusKey(a.status)">{{ a.status }}</span>
            <span *ngIf="selectedId() === a.appointment_id" class="check-mark">✓</span>
          </div>
          <div class="card-type">{{ a.appointment_type }}</div>
          <div class="card-meta"><span class="meta-left">{{ a.doctor_name }} · {{ a.clinic_name }}</span></div>
        </button>
      </div>
    </ng-container>

    <!-- Context strip -->
    <div *ngIf="selectedAppt() as s" class="context-strip">
      <span class="ctx-label">Recording for:</span>
      <span class="ctx-value">{{ s.appointment_time }} · {{ s.appointment_type }} · {{ s.doctor_name }} · {{ s.clinic_name }}</span>
    </div>

    <!-- Success screen -->
    <div *ngIf="submitSuccess()" class="success-screen">
      <div class="success-icon">✓</div>
      <h3>Visit submitted successfully</h3>
      <p>{{ submitDate }}</p>
    </div>

    <!-- ── 4-step wizard ─────────────────────────────────────────── -->
    <ng-container *ngIf="selectedAppt() && !submitSuccess()">

      <!-- Step indicator bar -->
      <div class="step-bar">
        <div class="step-item" [class.si-active]="step()===1" [class.si-done]="step()>1"
             [class.si-clickable]="step()>1" (click)="step()>1 ? step.set(1) : null">
          <div class="si-circle">{{ step() > 1 ? '✓' : '1' }}</div>
          <span class="si-label">Patient intake</span>
        </div>
        <div class="step-conn" [class.conn-done]="step()>1"></div>
        <div class="step-item" [class.si-active]="step()===2" [class.si-done]="step()>2"
             [class.si-clickable]="step()>2" (click)="step()>2 ? step.set(2) : null">
          <div class="si-circle">{{ step() > 2 ? '✓' : '2' }}</div>
          <span class="si-label">Select teeth</span>
        </div>
        <div class="step-conn" [class.conn-done]="step()>2"></div>
        <div class="step-item" [class.si-active]="step()===3" [class.si-done]="step()>3"
             [class.si-clickable]="step()>3" (click)="step()>3 ? step.set(3) : null">
          <div class="si-circle">{{ step() > 3 ? '✓' : '3' }}</div>
          <span class="si-label">Add findings</span>
        </div>
        <div class="step-conn" [class.conn-done]="step()>3"></div>
        <div class="step-item" [class.si-active]="step()===4">
          <div class="si-circle">4</div>
          <span class="si-label">Review &amp; submit</span>
        </div>
      </div>

      <!-- ── STEP 1: Patient Intake ───────────────────────────────── -->
      <div *ngIf="step()===1" class="step-panel">
        <div class="step-card">
          <div class="sc-header">
            <span class="sc-title">Patient intake — what the patient reports today</span>
          </div>

          <!-- Chief complaint -->
          <div class="intake-field-group">
            <label class="intake-lbl">Chief complaint <span class="req-star">*</span></label>
            <textarea [(ngModel)]="intakeChiefComplaint" name="chiefComplaint"
                      class="intake-textarea" rows="3"
                      placeholder="In the patient's own words — e.g. 'pain in lower right molar for 3 days'…"
                      maxlength="4000"></textarea>
            <span class="char-hint" [class.char-warn]="intakeChiefComplaint.length < 3 && intakeChiefComplaint.length > 0">
              Min 3 characters ({{ intakeChiefComplaint.length }}/4000)
            </span>
          </div>

          <!-- Pain score -->
          <div class="intake-field-group">
            <label class="intake-lbl">
              Pain score <span class="req-star">*</span>
              <span class="pain-readout">{{ intakePainScore }}/10 — {{ painLabel(intakePainScore) }}</span>
            </label>
            <div class="pain-slider-row">
              <span class="pain-cap">0 No pain</span>
              <input type="range"
                     [ngModel]="intakePainScore"
                     (ngModelChange)="intakePainScore = +$event"
                     name="painScore" min="0" max="10" step="1" class="pain-slider">
              <span class="pain-cap pain-cap-r">10 Worst</span>
            </div>
          </div>

          <!-- Chronic conditions -->
          <div class="intake-field-group">
            <label class="intake-lbl">Chronic conditions <span class="req-star">*</span></label>
            <div class="radio-group">
              <label class="radio-opt" [class.radio-opt-sel]="intakeChronicChoice === 'none'">
                <input type="radio" name="chronicChoice" value="none"
                       [(ngModel)]="intakeChronicChoice"> None reported
              </label>
              <label class="radio-opt" [class.radio-opt-sel]="intakeChronicChoice === 'has'">
                <input type="radio" name="chronicChoice" value="has"
                       [(ngModel)]="intakeChronicChoice"> Has condition(s)
              </label>
            </div>
            <textarea *ngIf="intakeChronicChoice === 'has'"
                      [(ngModel)]="intakeChronicDiseases" name="chronicDiseases"
                      class="intake-textarea intake-textarea-sm" rows="2"
                      placeholder="e.g. Type 2 diabetes, hypertension, controlled asthma…"
                      maxlength="500"></textarea>
          </div>

          <!-- Allergies -->
          <div class="intake-field-group">
            <label class="intake-lbl">Allergies <span class="req-star">*</span></label>
            <div class="radio-group">
              <label class="radio-opt" [class.radio-opt-sel]="intakeAllergyChoice === 'none'">
                <input type="radio" name="allergyChoice" value="none"
                       [(ngModel)]="intakeAllergyChoice"> None reported
              </label>
              <label class="radio-opt" [class.radio-opt-sel]="intakeAllergyChoice === 'has'">
                <input type="radio" name="allergyChoice" value="has"
                       [(ngModel)]="intakeAllergyChoice"> Has allergy(ies)
              </label>
            </div>
            <textarea *ngIf="intakeAllergyChoice === 'has'"
                      [(ngModel)]="intakeAllergies" name="allergies"
                      class="intake-textarea intake-textarea-sm" rows="2"
                      placeholder="e.g. Penicillin, lidocaine, latex…"
                      maxlength="500"></textarea>
          </div>

          <div class="step-footer">
            <button class="btn-next" [disabled]="!intakeValid" (click)="step.set(2)">
              Next: Select teeth →
            </button>
          </div>
        </div>
      </div>

      <!-- ── STEP 2: Select Teeth ──────────────────────────────────── -->
      <div *ngIf="step()===2" class="step-panel">
        <div class="step-card">
          <div class="sc-header">
            <span class="sc-title">Select teeth to include in this visit</span>
            <span class="sel-badge" [class.has-sel]="selectedTeeth().size > 0">
              {{ selectedTeeth().size }} selected
            </span>
          </div>

          <!-- Legend -->
          <div class="chart-legend">
            <span class="leg-item"><span class="leg-dot" style="background:#ef4444"></span>Caries</span>
            <span class="leg-item"><span class="leg-dot" style="background:#3b82f6"></span>Restoration</span>
            <span class="leg-item"><span class="leg-dot" style="background:#94a3b8"></span>Missing</span>
            <span class="leg-item"><span class="leg-dot" style="background:#10b981"></span>Implant</span>
            <span class="leg-item"><span class="leg-dot" style="background:#c8a84b"></span>Selected</span>
          </div>

          <!-- Tooth grid -->
          <div class="chart-grid">
            <div *ngFor="let quad of quadrants" class="quad-block">
              <div class="quad-label">{{ quad.label }}</div>
              <div class="tooth-row" [class.row-rev]="quad.reversed">
                <div *ngFor="let t of quad.teeth"
                     class="tooth-cell"
                     [class.tooth-sel]="selectedTeeth().has(t)"
                     [style.background]="selectedTeeth().has(t) ? '#fdf3dc' : getToothConditionColor(t)"
                     [style.border-color]="selectedTeeth().has(t) ? '#c8a84b' : '#e2e8f0'"
                     (click)="toggleTooth(t)">
                  <span class="tooth-num">{{ t }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="step-footer step-footer-split">
            <button class="btn-back" (click)="step.set(1)">← Back</button>
            <button class="btn-next" [disabled]="selectedTeeth().size === 0" (click)="goToFindingsStep()">
              Next: Add findings →
            </button>
          </div>
        </div>
      </div>

      <!-- ── STEP 3: Add Findings ──────────────────────────────────── -->
      <div *ngIf="step()===3" class="step-panel">
        <div class="findings-layout">

          <!-- Left column -->
          <div class="findings-left">

            <!-- Per-tooth cards -->
            <div *ngFor="let entry of toothEntries; let ti = index" class="tooth-card">
              <div class="tc-header">
                <span class="tc-badge">{{ entry.toothNumber }}</span>
                <span class="tc-name">{{ getToothName(entry.toothNumber) }}</span>
              </div>

              <div *ngFor="let proc of entry.procedures; let pi = index" class="proc-row">
                <div class="proc-fields">
                  <div class="field-row-2col">
                    <div class="field-group">
                      <label class="field-lbl">Diagnosis (Dx)</label>
                      <select [(ngModel)]="proc.diagnosis" [name]="'dx_'+ti+'_'+pi" class="field-sel">
                        <option value="">— Select diagnosis —</option>
                        <option *ngFor="let d of dxOptions" [value]="d">{{ d }}</option>
                      </select>
                    </div>
                    <div class="field-group">
                      <label class="field-lbl">Treatment (Tx)</label>
                      <select [(ngModel)]="proc.treatment" [name]="'tx_'+ti+'_'+pi" class="field-sel">
                        <option value="">— Select treatment —</option>
                        <option *ngFor="let t of txOptions" [value]="t">{{ t }}</option>
                      </select>
                    </div>
                  </div>
                  <div class="field-group">
                    <label class="field-lbl">Clinical findings</label>
                    <textarea [(ngModel)]="proc.clinicalFindings" [name]="'cf_'+ti+'_'+pi"
                              class="field-area" rows="2" placeholder="Describe clinical findings…"></textarea>
                  </div>
                  <div class="field-group">
                    <label class="field-lbl">Radiographic findings</label>
                    <textarea [(ngModel)]="proc.radiographicFindings" [name]="'rf_'+ti+'_'+pi"
                              class="field-area" rows="2" placeholder="Describe radiographic findings…"></textarea>
                  </div>
                </div>
                <button *ngIf="entry.procedures.length > 1" class="btn-rm-proc"
                        (click)="removeProcedure(ti, pi)" title="Remove">×</button>
              </div>

              <button class="btn-add-proc" (click)="addProcedure(ti)">
                + Add another procedure for this tooth
              </button>
            </div>

            <!-- General progress note -->
            <div class="pn-card">
              <div class="pn-label">General Progress Note</div>
              <div class="pn-sub">overall visit summary, not tooth-specific</div>
              <textarea [(ngModel)]="progressNote" name="progressNote" class="field-area" rows="4"
                        placeholder="e.g. Patient tolerated procedure well. Follow-up in 2 weeks. OHI given…"></textarea>
            </div>

          </div>

          <!-- Right column: live summary -->
          <div class="findings-right">
            <div class="summary-panel">
              <div class="sp-title">Live Summary</div>

              <ng-container *ngIf="hasAnySummaryData(); else spEmpty">
                <div *ngFor="let entry of toothEntries" class="sp-tooth">
                  <div class="sp-th">
                    <span class="sp-num">{{ entry.toothNumber }}</span>
                    <span class="sp-name">{{ getToothShortName(entry.toothNumber) }}</span>
                  </div>
                  <div *ngFor="let proc of entry.procedures" class="sp-proc">
                    <span *ngIf="proc.diagnosis"            class="sp-tag sp-dx">Dx: {{ proc.diagnosis }}</span>
                    <span *ngIf="proc.treatment"            class="sp-tag sp-tx">Tx: {{ proc.treatment }}</span>
                    <span *ngIf="proc.clinicalFindings"     class="sp-tag sp-cf">Cf</span>
                    <span *ngIf="proc.radiographicFindings" class="sp-tag sp-rf">Rf</span>
                  </div>
                </div>
                <div *ngIf="progressNote" class="sp-pn">
                  <div class="sp-pn-lbl">Note:</div>
                  <div class="sp-pn-txt">{{ progressNote }}</div>
                </div>
              </ng-container>
              <ng-template #spEmpty>
                <div class="sp-empty">Fill in findings to see summary</div>
              </ng-template>
            </div>
          </div>

        </div><!-- /findings-layout -->

        <div class="step-footer step-footer-split">
          <button class="btn-back" (click)="step.set(2)">← Back</button>
          <button class="btn-next" (click)="step.set(4)">Review &amp; Submit →</button>
        </div>
      </div>

      <!-- ── STEP 4: Review & Submit ───────────────────────────────── -->
      <div *ngIf="step()===4" class="step-panel">
        <div class="review-card">

          <!-- Intake summary -->
          <div class="rv-intake">
            <div class="rv-intake-title">Patient Intake</div>
            <div class="rv-intake-row">
              <span class="rv-chip rv-cc">CC</span>
              <span class="rv-val">{{ intakeChiefComplaint }}</span>
            </div>
            <div class="rv-intake-row">
              <span class="rv-chip rv-pain">Pain</span>
              <span class="rv-val">{{ intakePainScore }}/10 — {{ painLabel(intakePainScore) }}</span>
            </div>
            <div class="rv-intake-row">
              <span class="rv-chip rv-chronic">Chronic</span>
              <span class="rv-val">{{ intakeChronicChoice === 'has' ? intakeChronicDiseases : 'None reported' }}</span>
            </div>
            <div class="rv-intake-row">
              <span class="rv-chip rv-allergy">Allergies</span>
              <span class="rv-val">{{ intakeAllergyChoice === 'has' ? intakeAllergies : 'None reported' }}</span>
            </div>
          </div>

          <div class="review-stats">
            {{ selectedTeeth().size }} teeth · {{ totalDiagnoses }} diagnoses · {{ totalTreatments }} treatments
          </div>

          <div *ngFor="let entry of toothEntries" class="rv-tooth">
            <div class="rv-th">
              <span class="rv-num">{{ entry.toothNumber }}</span>
              <span class="rv-name">{{ getToothName(entry.toothNumber) }}</span>
            </div>
            <div *ngFor="let proc of entry.procedures" class="rv-proc">
              <div *ngIf="proc.diagnosis" class="rv-row">
                <span class="rv-chip rv-dx">Dx</span>
                <span class="rv-val">{{ proc.diagnosis }}</span>
                <span *ngIf="proc.clinicalFindings" class="rv-find">— {{ proc.clinicalFindings }}</span>
              </div>
              <div *ngIf="proc.treatment" class="rv-row">
                <span class="rv-chip rv-tx">Tx</span>
                <span class="rv-val">{{ proc.treatment }}</span>
              </div>
              <div *ngIf="proc.radiographicFindings" class="rv-row">
                <span class="rv-chip rv-rf">Rf</span>
                <span class="rv-val">{{ proc.radiographicFindings }}</span>
              </div>
            </div>
          </div>

          <div *ngIf="progressNote" class="rv-pn">
            <div class="rv-pn-lbl">General Progress Note</div>
            <div class="rv-pn-txt">{{ progressNote }}</div>
          </div>

          <div *ngIf="submitError" class="error-text">{{ submitError }}</div>
        </div>

        <div class="step-footer step-footer-split">
          <button class="btn-back" (click)="step.set(3)">← Back</button>
          <button class="btn-submit" [disabled]="submitting()" (click)="submitVisit()">
            {{ submitting() ? 'Submitting…' : 'Submit visit' }}
          </button>
        </div>
      </div>

    </ng-container>
    <!-- /wizard -->

  </ng-container>

  <!-- Switch-appointment dialog -->
  <div *ngIf="pendingSwitchId() !== null" class="dlg-overlay" (click)="cancelSwitch()">
    <div class="dlg" (click)="$event.stopPropagation()">
      <h4>Switch appointment?</h4>
      <p>Any selections or findings entered will be cleared.</p>
      <div class="dlg-actions">
        <button class="dlg-cancel" (click)="cancelSwitch()">Cancel</button>
        <button class="dlg-danger" (click)="confirmSwitch()">Switch</button>
      </div>
    </div>
  </div>

</div>
  `,
  styles: [`
    .tv-wrapper { padding: 20px; }

    /* Loading / Empty */
    .loading-text { color:#94a3b8; font-style:italic; padding:20px; text-align:center; }
    .empty-state-card { text-align:center; padding:40px 20px; background:#f8fafc; border-radius:8px; border:1px dashed #cbd5e1; }
    .empty-icon { font-size:2.5rem; margin-bottom:12px; }
    .empty-state-card h4 { color:#1e293b; margin:0 0 8px; }
    .empty-state-card p  { color:#64748b; font-size:0.9rem; }

    /* Picker */
    .picker-label { font-size:0.82rem; color:#64748b; font-weight:600; margin-bottom:8px; }
    .picker-grid  { display:grid; grid-template-columns:1fr 1fr; gap:10px; margin-bottom:14px; }
    .visit-card {
      position:relative; text-align:left; cursor:pointer;
      padding:12px 14px; border:1px solid #e5e7eb; border-radius:8px;
      background:white; transition:background 0.1s, border-color 0.1s;
    }
    .visit-card:hover { background:#f8fafc; }
    .visit-card.selected { border:2px solid #d69e2e; background:#FAEEDA; padding:11px 13px; }
    .visit-card.selected .card-time { color:#854F0B; }
    .card-top  { display:flex; align-items:center; gap:8px; margin-bottom:4px; }
    .card-time { font-size:0.95rem; font-weight:600; color:#1e293b; flex:1; }
    .status-pill { border-radius:10px; padding:2px 9px; font-size:0.7rem; font-weight:700; }
    .st-scheduled   { background:#e2e8f0; color:#475569; }
    .st-in-progress { background:#E1F5EE; color:#085041; }
    .check-mark {
      position:absolute; top:-6px; right:-6px; width:20px; height:20px; border-radius:50%;
      background:#d69e2e; color:white; display:flex; align-items:center; justify-content:center;
      font-size:0.72rem; font-weight:700;
    }
    .card-type { font-size:0.82rem; font-weight:600; color:#1e293b; margin-bottom:4px; }
    .card-meta { font-size:0.72rem; color:#64748b; }
    .meta-left { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

    /* Context strip */
    .context-strip {
      padding:10px 14px; background:#FAEEDA; border:1px solid #FAC775;
      border-radius:6px; margin-bottom:16px; font-size:0.8rem;
    }
    .ctx-label { color:#854F0B; margin-right:6px; font-weight:600; }
    .ctx-value { color:#633806; font-weight:500; }

    /* Step bar */
    .step-bar {
      display:flex; align-items:center; background:white; border:1px solid #e2e8f0;
      border-radius:8px; padding:10px 14px; margin-bottom:16px; flex-wrap:wrap; gap:4px;
    }
    .step-item { display:flex; align-items:center; gap:6px; flex:0 0 auto; user-select:none; }
    .step-item.si-clickable { cursor:pointer; }
    .step-item.si-clickable:hover .si-circle { opacity:0.85; }
    .si-circle {
      width:26px; height:26px; border-radius:50%; display:flex; align-items:center; justify-content:center;
      font-size:0.75rem; font-weight:700; background:#e2e8f0; color:#64748b; transition:background 0.2s;
    }
    .si-label { font-size:0.78rem; font-weight:500; color:#64748b; }
    .step-item.si-active .si-circle { background:#1a365d; color:white; }
    .step-item.si-active .si-label  { color:#1a365d; font-weight:700; }
    .step-item.si-done .si-circle   { background:#10b981; color:white; }
    .step-item.si-done .si-label    { color:#059669; }
    .step-conn { flex:1; min-width:14px; height:2px; background:#e2e8f0; margin:0 6px; }
    .step-conn.conn-done { background:#10b981; }

    /* Step panel */
    .step-panel { }
    .step-card  { background:white; border:1px solid #e2e8f0; border-radius:8px; padding:20px; }

    /* Intake step */
    .sc-header    { display:flex; align-items:center; justify-content:space-between; margin-bottom:18px; }
    .sc-title     { font-size:0.95rem; font-weight:700; color:#1e293b; }
    .intake-field-group { display:flex; flex-direction:column; gap:6px; margin-bottom:18px; }
    .intake-lbl {
      font-size:0.82rem; font-weight:700; color:#1e293b;
      display:flex; align-items:center; gap:8px;
    }
    .req-star   { color:#ef4444; }
    .intake-textarea {
      width:100%; padding:8px 10px; border:1px solid #e2e8f0; border-radius:6px;
      font-size:0.85rem; resize:vertical; font-family:inherit; box-sizing:border-box;
    }
    .intake-textarea:focus { outline:none; border-color:#1a365d; }
    .intake-textarea-sm { margin-top:6px; }
    .char-hint  { font-size:0.72rem; color:#94a3b8; }
    .char-warn  { color:#ef4444; }
    .pain-readout { margin-left:auto; font-size:0.82rem; font-weight:600; color:#1a365d; }
    .pain-slider-row { display:flex; align-items:center; gap:10px; }
    .pain-cap   { font-size:0.72rem; color:#94a3b8; white-space:nowrap; }
    .pain-cap-r { text-align:right; }
    .pain-slider { flex:1; accent-color:#1a365d; cursor:pointer; }
    .radio-group { display:flex; gap:10px; flex-wrap:wrap; }
    .radio-opt {
      display:flex; align-items:center; gap:6px; cursor:pointer;
      padding:6px 12px; border:1px solid #e2e8f0; border-radius:6px;
      font-size:0.83rem; color:#475569; transition:background 0.1s, border-color 0.1s;
    }
    .radio-opt input { cursor:pointer; accent-color:#1a365d; }
    .radio-opt:hover { background:#f8fafc; }
    .radio-opt.radio-opt-sel { background:#f0f5ff; border-color:#1a365d; color:#1a365d; font-weight:600; }

    /* Step 1 teeth */
    .sel-badge    { background:#e2e8f0; color:#475569; border-radius:12px; padding:3px 10px; font-size:0.78rem; font-weight:600; }
    .sel-badge.has-sel { background:#fef3c7; color:#b45309; }
    .chart-legend { display:flex; gap:14px; margin-bottom:14px; flex-wrap:wrap; }
    .leg-item  { display:flex; align-items:center; gap:5px; font-size:0.78rem; color:#475569; }
    .leg-dot   { width:12px; height:12px; border-radius:3px; flex-shrink:0; }
    .chart-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; margin-bottom:16px; }
    .quad-block { border:1px solid #e2e8f0; border-radius:6px; padding:8px; }
    .quad-label { font-size:0.68rem; color:#94a3b8; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:6px; }
    .tooth-row  { display:flex; gap:3px; flex-wrap:wrap; }
    .tooth-row.row-rev { flex-direction:row-reverse; }
    .tooth-cell {
      width:32px; height:40px; border:2px solid #e2e8f0; border-radius:4px;
      display:flex; align-items:center; justify-content:center; cursor:pointer;
      transition:transform 0.1s, border-color 0.15s, background 0.15s; user-select:none;
    }
    .tooth-cell:hover { transform:scale(1.12); z-index:1; }
    .tooth-cell.tooth-sel { box-shadow:0 0 0 1px #c8a84b; }
    .tooth-num { font-size:0.6rem; font-weight:700; color:#1e293b; }

    /* Step footer */
    .step-footer { display:flex; justify-content:flex-end; gap:10px; margin-top:16px; }
    .step-footer-split { justify-content:space-between; }
    .btn-next {
      background:#1a365d; color:white; border:none; border-radius:6px;
      padding:8px 18px; font-size:0.88rem; font-weight:600; cursor:pointer;
    }
    .btn-next:hover:not(:disabled) { background:#2c5282; }
    .btn-next:disabled { opacity:0.5; cursor:not-allowed; }
    .btn-back {
      background:#f1f5f9; color:#475569; border:none; border-radius:6px;
      padding:8px 16px; font-size:0.88rem; cursor:pointer; font-weight:500;
    }
    .btn-back:hover { background:#e2e8f0; }
    .btn-submit {
      background:#059669; color:white; border:none; border-radius:6px;
      padding:8px 20px; font-size:0.88rem; font-weight:700; cursor:pointer;
    }
    .btn-submit:hover:not(:disabled) { background:#047857; }
    .btn-submit:disabled { opacity:0.5; cursor:not-allowed; }

    /* Step 3 findings layout */
    .findings-layout { display:flex; gap:16px; align-items:flex-start; }
    .findings-left   { flex:1; min-width:0; display:flex; flex-direction:column; gap:12px; }
    .findings-right  { width:195px; flex-shrink:0; }

    /* Tooth card */
    .tooth-card { background:white; border:1px solid #e2e8f0; border-radius:8px; padding:14px; }
    .tc-header  { display:flex; align-items:center; gap:10px; margin-bottom:12px; padding-bottom:10px; border-bottom:1px solid #f1f5f9; }
    .tc-badge   {
      width:32px; height:32px; background:#1a365d; color:white; border-radius:6px;
      display:flex; align-items:center; justify-content:center; font-size:0.78rem; font-weight:700; flex-shrink:0;
    }
    .tc-name { font-size:0.88rem; font-weight:600; color:#1e293b; }

    .proc-row { display:flex; gap:8px; margin-bottom:8px; padding-bottom:8px; border-bottom:1px dashed #f1f5f9; }
    .proc-row:last-of-type { border-bottom:none; margin-bottom:0; padding-bottom:0; }
    .proc-fields { flex:1; display:flex; flex-direction:column; gap:8px; }
    .field-row-2col { display:flex; gap:8px; }
    .field-group { flex:1; display:flex; flex-direction:column; gap:3px; }
    .field-lbl  { font-size:0.72rem; font-weight:600; color:#64748b; }
    .field-sel  { width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:5px; font-size:0.83rem; background:white; box-sizing:border-box; }
    .field-area { width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:5px; font-size:0.83rem; resize:vertical; box-sizing:border-box; font-family:inherit; }
    .field-sel:focus, .field-area:focus { outline:none; border-color:#1a365d; }
    .btn-rm-proc {
      flex-shrink:0; width:22px; height:22px; border-radius:50%; background:#fee2e2; color:#b91c1c;
      border:none; cursor:pointer; font-size:1.1rem; line-height:1; margin-top:22px;
      display:flex; align-items:center; justify-content:center;
    }
    .btn-rm-proc:hover { background:#fecaca; }
    .btn-add-proc {
      width:100%; margin-top:8px; padding:5px 10px; background:none;
      border:1px dashed #cbd5e1; border-radius:5px; color:#64748b;
      font-size:0.78rem; cursor:pointer;
    }
    .btn-add-proc:hover { background:#f8fafc; border-color:#94a3b8; }

    /* Progress note card */
    .pn-card  { background:white; border:1px solid #e2e8f0; border-radius:8px; padding:14px; }
    .pn-label { font-size:0.88rem; font-weight:700; color:#1e293b; margin-bottom:2px; }
    .pn-sub   { font-size:0.74rem; color:#94a3b8; margin-bottom:8px; }

    /* Summary panel */
    .summary-panel {
      background:white; border:1px solid #e2e8f0; border-radius:8px;
      padding:12px; position:sticky; top:20px;
    }
    .sp-title { font-size:0.72rem; font-weight:700; color:#64748b; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:10px; }
    .sp-tooth { margin-bottom:10px; }
    .sp-th    { display:flex; align-items:center; gap:6px; margin-bottom:4px; }
    .sp-num   { font-size:0.7rem; font-weight:700; color:white; background:#1a365d; border-radius:4px; padding:1px 5px; }
    .sp-name  { font-size:0.7rem; color:#475569; font-weight:500; }
    .sp-proc  { display:flex; flex-wrap:wrap; gap:3px; margin-bottom:2px; }
    .sp-tag   { border-radius:4px; padding:1px 5px; font-size:0.65rem; font-weight:600; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .sp-dx { background:#fee2e2; color:#b91c1c; }
    .sp-tx { background:#dbeafe; color:#1d4ed8; }
    .sp-cf { background:#fef3c7; color:#b45309; }
    .sp-rf { background:#ede9fe; color:#7c3aed; }
    .sp-pn     { border-top:1px solid #f1f5f9; padding-top:8px; margin-top:4px; }
    .sp-pn-lbl { font-size:0.65rem; font-weight:700; color:#94a3b8; margin-bottom:3px; }
    .sp-pn-txt { font-size:0.72rem; color:#475569; white-space:pre-wrap; word-break:break-word; max-height:80px; overflow-y:auto; }
    .sp-empty  { font-size:0.75rem; color:#94a3b8; font-style:italic; text-align:center; padding:20px 0; }

    /* Step 4 review */
    .review-card  { background:white; border:1px solid #e2e8f0; border-radius:8px; padding:20px; display:flex; flex-direction:column; gap:14px; }
    .rv-intake    { border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
    .rv-intake-title { font-size:0.78rem; font-weight:700; color:#64748b; background:#f8fafc; padding:8px 12px; border-bottom:1px solid #e2e8f0; }
    .rv-intake-row { display:flex; align-items:baseline; gap:8px; padding:6px 12px; font-size:0.83rem; border-top:1px solid #f8fafc; }
    .review-stats { font-size:0.82rem; font-weight:600; color:#64748b; background:#f8fafc; border-radius:6px; padding:8px 12px; }
    .rv-tooth { border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
    .rv-th    { display:flex; align-items:center; gap:10px; background:#f8fafc; padding:8px 12px; }
    .rv-num   { font-size:0.75rem; font-weight:700; color:white; background:#1a365d; border-radius:4px; padding:1px 6px; }
    .rv-name  { font-size:0.85rem; font-weight:600; color:#1e293b; }
    .rv-proc  { padding:8px 12px; display:flex; flex-direction:column; gap:5px; border-top:1px solid #f1f5f9; }
    .rv-row   { display:flex; align-items:baseline; gap:6px; font-size:0.83rem; }
    .rv-chip  { border-radius:4px; padding:1px 6px; font-size:0.68rem; font-weight:700; flex-shrink:0; }
    .rv-cc      { background:#dcfce7; color:#15803d; }
    .rv-pain    { background:#fef3c7; color:#b45309; }
    .rv-chronic { background:#e0f2fe; color:#0369a1; }
    .rv-allergy { background:#ffedd5; color:#c2410c; }
    .rv-dx { background:#fee2e2; color:#b91c1c; }
    .rv-tx { background:#dbeafe; color:#1d4ed8; }
    .rv-rf { background:#ede9fe; color:#7c3aed; }
    .rv-val   { color:#1e293b; font-weight:500; }
    .rv-find  { color:#64748b; font-size:0.8rem; }
    .rv-pn    { border:1px solid #e2e8f0; border-radius:6px; overflow:hidden; }
    .rv-pn-lbl { font-size:0.78rem; font-weight:700; color:#64748b; background:#f8fafc; padding:8px 12px; }
    .rv-pn-txt { padding:8px 12px; font-size:0.85rem; color:#334155; white-space:pre-wrap; }

    /* Success */
    .success-screen {
      text-align:center; padding:48px 20px; background:#f0fdf4;
      border:1px solid #86efac; border-radius:10px;
    }
    .success-icon {
      width:56px; height:56px; background:#10b981; color:white; border-radius:50%;
      display:flex; align-items:center; justify-content:center;
      font-size:1.8rem; font-weight:700; margin:0 auto 14px;
    }
    .success-screen h3 { margin:0 0 6px; color:#065f46; font-size:1.1rem; }
    .success-screen p  { color:#047857; font-size:0.88rem; margin:0; }

    /* Error */
    .error-text { color:#ef4444; font-size:0.82rem; }

    /* Dialog */
    .dlg-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.5); display:flex; align-items:center; justify-content:center; z-index:1000; }
    .dlg { background:white; border-radius:10px; padding:20px 24px; width:380px; box-shadow:0 20px 40px rgba(0,0,0,0.2); }
    .dlg h4 { margin:0 0 8px; color:#1e293b; font-size:1rem; }
    .dlg p  { margin:0 0 18px; color:#475569; font-size:0.9rem; }
    .dlg-actions { display:flex; justify-content:flex-end; gap:8px; }
    .dlg-cancel { background:#f1f5f9; color:#475569; border:none; border-radius:5px; padding:6px 14px; cursor:pointer; }
    .dlg-danger { background:#b91c1c; color:white; border:none; border-radius:5px; padding:6px 14px; cursor:pointer; font-weight:600; }
    .dlg-danger:hover { background:#991b1b; }
  `],
})
export class TodaysVisitComponent implements OnInit {
  @Input({ required: true }) patientId!: number;
  @Input({ required: true }) recordId!:  number;

  // ── Appointment state ─────────────────────────────────────────────────────
  loading         = signal(true);
  appointments    = signal<TodaysAppt[]>([]);
  selectedId      = signal<number | null>(null);
  selectedAppt    = computed(() => this.appointments().find(a => a.appointment_id === this.selectedId()) ?? null);
  pendingSwitchId = signal<number | null>(null);

  // ── Wizard state ──────────────────────────────────────────────────────────
  step          = signal(1);
  selectedTeeth = signal(new Set<number>());
  toothEntries: ToothEntry[] = [];
  progressNote  = '';
  submitting    = signal(false);
  submitSuccess = signal(false);
  submitDate    = '';
  submitError   = '';

  // ── Intake state (Step 1) ─────────────────────────────────────────────────
  intakeChiefComplaint  = '';
  intakePainScore       = 0;
  intakeChronicChoice:  'none' | 'has' | null = null;
  intakeChronicDiseases = '';
  intakeAllergyChoice:  'none' | 'has' | null = null;
  intakeAllergies       = '';

  get intakeValid(): boolean {
    return (
      this.intakeChiefComplaint.trim().length >= 3 &&
      this.intakeChronicChoice !== null &&
      this.intakeAllergyChoice !== null
    );
  }

  // ── Dental chart backing data ─────────────────────────────────────────────
  private toothConditions = new Map<number, string>();

  // ── Constants ─────────────────────────────────────────────────────────────
  readonly quadrants = [
    { label: 'Upper Right (1x)', teeth: [18,17,16,15,14,13,12,11], reversed: true  },
    { label: 'Upper Left (2x)',  teeth: [21,22,23,24,25,26,27,28], reversed: false },
    { label: 'Lower Right (4x)', teeth: [48,47,46,45,44,43,42,41], reversed: true  },
    { label: 'Lower Left (3x)',  teeth: [31,32,33,34,35,36,37,38], reversed: false },
  ];

  dxOptions: string[] = ['Healthy', 'Cavity', 'Fracture', 'Missing', 'Treated', 'Periapical lesion', 'Gingivitis'];
  txOptions: string[] = ['Filling', 'Extraction', 'Crown', 'RCT', 'Scaling', 'Implant', 'Review', 'Whitening'];

  private readonly toothNames: Record<number, string> = {
    11: 'UR Central Incisor',  12: 'UR Lateral Incisor', 13: 'UR Canine',
    14: 'UR 1st Premolar',     15: 'UR 2nd Premolar',    16: 'UR 1st Molar',
    17: 'UR 2nd Molar',        18: 'UR 3rd Molar',
    21: 'UL Central Incisor',  22: 'UL Lateral Incisor', 23: 'UL Canine',
    24: 'UL 1st Premolar',     25: 'UL 2nd Premolar',    26: 'UL 1st Molar',
    27: 'UL 2nd Molar',        28: 'UL 3rd Molar',
    31: 'LL Central Incisor',  32: 'LL Lateral Incisor', 33: 'LL Canine',
    34: 'LL 1st Premolar',     35: 'LL 2nd Premolar',    36: 'LL 1st Molar',
    37: 'LL 2nd Molar',        38: 'LL 3rd Molar',
    41: 'LR Central Incisor',  42: 'LR Lateral Incisor', 43: 'LR Canine',
    44: 'LR 1st Premolar',     45: 'LR 2nd Premolar',    46: 'LR 1st Molar',
    47: 'LR 2nd Molar',        48: 'LR 3rd Molar',
  };

  constructor(
    private pfSvc:   PatientFileService,
    private dcSvc:   DentalChartService,
    private http:    HttpClient,
    private lookups: LookupPublicService,
  ) {}

  ngOnInit(): void {
    this.lookups.getLabels('diagnosis_type').subscribe(v => { if (v.length) this.dxOptions = v; });
    this.lookups.getLabels('treatment_type').subscribe(v => { if (v.length) this.txOptions = v; });

    this.pfSvc.getTodaysAppointments(this.patientId).subscribe({
      next: (res: any) => {
        const list = (res?.data?.appointments ?? []) as TodaysAppt[];
        this.appointments.set(list);
        if (list.length === 0) { this.loading.set(false); return; }
        const inProgress = list.find(a => a.status === 'In Progress');
        this.selectedId.set((inProgress ?? list[0]).appointment_id);
        this.loading.set(false);
        this.loadDentalChart();
      },
      error: () => { this.loading.set(false); },
    });
  }

  // ── Dental chart ──────────────────────────────────────────────────────────
  private loadDentalChart(): void {
    this.dcSvc.getByRecord(this.recordId).subscribe({
      next: (res: any) => {
        const rows: any[] = res?.data ?? [];
        const latest = new Map<number, any>();
        for (const r of rows) {
          const n = parseInt(r.tooth_number, 10);
          const ex = latest.get(n);
          if (!ex || new Date(r.created_at) > new Date(ex.created_at)) latest.set(n, r);
        }
        this.toothConditions.clear();
        for (const [n, r] of latest) {
          const note = (r.tooth_note ?? '').toLowerCase();
          if      (note.includes('caries'))       this.toothConditions.set(n, 'caries');
          else if (note.includes('restoration'))  this.toothConditions.set(n, 'restoration');
          else if (note.includes('missing'))      this.toothConditions.set(n, 'missing');
          else if (note.includes('implant'))      this.toothConditions.set(n, 'implant');
          else                                    this.toothConditions.set(n, 'noted');
        }
      },
      error: () => {},
    });
  }

  getToothConditionColor(tooth: number): string {
    const c = this.toothConditions.get(tooth);
    if (c === 'caries')      return '#fecaca';
    if (c === 'restoration') return '#bfdbfe';
    if (c === 'missing')     return '#e2e8f0';
    if (c === 'implant')     return '#a7f3d0';
    if (c === 'noted')       return '#fef9c3';
    return '#f8fafc';
  }

  // ── Appointment selection ─────────────────────────────────────────────────
  statusKey(s: string): string { return s.toLowerCase().replace(/\s+/g, '-'); }

  requestSelect(id: number): void {
    if (id === this.selectedId()) return;
    if (this.step() > 1 || this.selectedTeeth().size > 0 || this.intakeChiefComplaint.trim().length > 0) {
      this.pendingSwitchId.set(id);
    } else {
      this.switchTo(id);
    }
  }

  confirmSwitch(): void {
    const id = this.pendingSwitchId();
    this.pendingSwitchId.set(null);
    if (id !== null) this.switchTo(id);
  }

  cancelSwitch(): void { this.pendingSwitchId.set(null); }

  private switchTo(id: number): void {
    this.selectedId.set(id);
    this.step.set(1);
    this.selectedTeeth.set(new Set());
    this.toothEntries = [];
    this.progressNote = '';
    this.submitSuccess.set(false);
    this.submitError = '';
    this.intakeChiefComplaint  = '';
    this.intakePainScore       = 0;
    this.intakeChronicChoice   = null;
    this.intakeChronicDiseases = '';
    this.intakeAllergyChoice   = null;
    this.intakeAllergies       = '';
  }

  // ── Intake step ───────────────────────────────────────────────────────────
  painLabel(score: number): string {
    const s = +score;
    if (s === 0) return 'No pain';
    if (s <= 3)  return 'Mild';
    if (s <= 6)  return 'Moderate';
    if (s <= 8)  return 'Severe';
    return 'Worst pain';
  }

  // ── Step 2 (teeth) ────────────────────────────────────────────────────────
  toggleTooth(num: number): void {
    const s = new Set(this.selectedTeeth());
    if (s.has(num)) s.delete(num); else s.add(num);
    this.selectedTeeth.set(s);
  }

  goToFindingsStep(): void {
    const selected = Array.from(this.selectedTeeth()).sort((a, b) => a - b);
    const existing = new Map(this.toothEntries.map(e => [e.toothNumber, e]));
    this.toothEntries = selected.map(num =>
      existing.get(num) ?? { toothNumber: num, procedures: [emptyProc()] }
    );
    this.step.set(3);
  }

  // ── Step 3 (findings) ─────────────────────────────────────────────────────
  addProcedure(ti: number): void {
    this.toothEntries[ti].procedures.push(emptyProc());
  }

  removeProcedure(ti: number, pi: number): void {
    this.toothEntries[ti].procedures.splice(pi, 1);
  }

  getToothName(num: number): string {
    return this.toothNames[num] ?? `Tooth ${num}`;
  }

  getToothShortName(num: number): string {
    const name = this.toothNames[num];
    if (!name) return `T${num}`;
    return name.split(' ').slice(1).join(' ');
  }

  hasAnySummaryData(): boolean {
    return this.toothEntries.some(e =>
      e.procedures.some(p => p.diagnosis || p.treatment || p.clinicalFindings || p.radiographicFindings)
    ) || !!this.progressNote;
  }

  // ── Step 4 (review) ───────────────────────────────────────────────────────
  get totalDiagnoses(): number {
    return this.toothEntries.reduce((s, e) => s + e.procedures.filter(p => p.diagnosis).length, 0);
  }

  get totalTreatments(): number {
    return this.toothEntries.reduce((s, e) => s + e.procedures.filter(p => p.treatment).length, 0);
  }

  // ── Submit ────────────────────────────────────────────────────────────────
  submitVisit(): void {
    const apptId = this.selectedId();
    if (!apptId) return;
    this.submitting.set(true);
    this.submitError = '';
    this.http.post(`${environment.apiUrl}/visits`, {
      appointmentId:   apptId,
      chiefComplaint:  this.intakeChiefComplaint,
      painScore:       this.intakePainScore,
      chronicDiseases: this.intakeChronicChoice === 'has' ? this.intakeChronicDiseases : 'None reported',
      allergies:       this.intakeAllergyChoice === 'has' ? this.intakeAllergies       : 'None reported',
      teeth:           this.toothEntries,
      progressNote:    this.progressNote,
      submittedAt:     new Date().toISOString(),
    }).subscribe({
      next: () => {
        this.submitSuccess.set(true);
        this.submitDate = new Date().toLocaleDateString('en-GB', {
          day: '2-digit', month: 'long', year: 'numeric',
        });
        this.submitting.set(false);
      },
      error: (err: any) => {
        this.submitError = err?.error?.error ?? 'Failed to submit visit. Please try again.';
        this.submitting.set(false);
      },
    });
  }
}
