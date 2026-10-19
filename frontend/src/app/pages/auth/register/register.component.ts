import { Component, OnInit } from '@angular/core';
import {
  FormBuilder,
  FormGroup,
  FormArray,
  Validators,
  AbstractControl,
  ValidationErrors,
} from '@angular/forms';
import { Router } from '@angular/router';
import { AuthRegistrationService, RoleOption } from '../../../services/auth-registration.service';

function passwordComplexityValidator(ctrl: AbstractControl): ValidationErrors | null {
  const v = ctrl.value as string;
  if (!v) return null;
  return /[a-zA-Z]/.test(v) && /\d/.test(v) ? null : { passwordComplexity: true };
}

function passwordsMatchValidator(group: AbstractControl): ValidationErrors | null {
  const pw  = group.get('password')?.value;
  const cpw = group.get('confirmPassword')?.value;
  return pw && cpw && pw !== cpw ? { passwordsMismatch: true } : null;
}

@Component({
  standalone: false,
  selector: 'app-register',
  templateUrl: './register.component.html',
})
export class RegisterComponent implements OnInit {
  form!: FormGroup;
  roles: RoleOption[] = [];
  contactTypeOptions: string[] = ['Email', 'Mobile', 'Work phone', 'Home phone'];
  isLoading = false;
  isLoadingRoles = true;
  errorMessage = '';
  showPassword = false;
  showConfirm = false;

  constructor(
    private fb: FormBuilder,
    private router: Router,
    private regSvc: AuthRegistrationService,
  ) {}

  ngOnInit(): void {
    this.form = this.fb.group(
      {
        firstName:       ['', [Validators.required, Validators.maxLength(100)]],
        middleName:      ['', [Validators.required, Validators.maxLength(100)]],
        lastName:        ['', [Validators.required, Validators.maxLength(100)]],
        civilId:         ['', [Validators.required, Validators.pattern(/^\d{10}$/)]],
        requestedRoleId: [null, Validators.required],
        password:        ['', [Validators.required, Validators.minLength(8), passwordComplexityValidator]],
        confirmPassword: ['', Validators.required],
        contacts:        this.fb.array([this.buildContactGroup(true)]),
      },
      { validators: passwordsMatchValidator },
    );

    this.regSvc.getRegisterableRoles().subscribe({
      next: res => { this.roles = res.data ?? []; this.isLoadingRoles = false; },
      error: () => { this.isLoadingRoles = false; },
    });

    this.regSvc.getContactTypes().subscribe({
      next: res => {
        if (res.data?.length) {
          this.contactTypeOptions = res.data.map((v: any) => v.valueLabel);
        }
      },
      error: () => {},
    });
  }

  // ── FormArray ──────────────────────────────────────────────────────────────

  get contacts(): FormArray {
    return this.form.get('contacts') as FormArray;
  }

  buildContactGroup(isPrimary = false): FormGroup {
    return this.fb.group({
      contactType: [this.contactTypeOptions[0] ?? 'Email', Validators.required],
      value:       ['', Validators.required],
      isPrimary:   [isPrimary],
      _isEditing:  [true],
      _snapshot:   [null],
    });
  }

  addContact(): void {
    this.contacts.push(this.buildContactGroup(false));
  }

  editContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    grp.patchValue({
      _isEditing: true,
      _snapshot:  { contactType: grp.value.contactType, value: grp.value.value },
    });
  }

  saveContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    grp.get('value')?.markAsTouched();
    grp.get('contactType')?.markAsTouched();
    if (!grp.get('value')?.valid || !grp.get('contactType')?.valid) return;
    grp.patchValue({ _isEditing: false, _snapshot: null });
  }

  cancelContact(i: number): void {
    const grp = this.contacts.at(i) as FormGroup;
    const snap = grp.value._snapshot;
    if (!snap) {
      // New contact with no saved state — remove it (keep at least one)
      if (this.contacts.length > 1) this.contacts.removeAt(i);
      return;
    }
    grp.patchValue({ contactType: snap.contactType, value: snap.value, _isEditing: false, _snapshot: null });
  }

  removeContact(i: number): void {
    if (i === 0 || this.contacts.length <= 1) return;
    this.contacts.removeAt(i);
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  onSubmit(): void {
    // Force-save any still-editing contacts
    for (let i = 0; i < this.contacts.length; i++) {
      const g = this.contacts.at(i) as FormGroup;
      if (g.value._isEditing) g.get('value')?.markAsTouched();
    }

    if (this.form.invalid) { this.form.markAllAsTouched(); return; }

    const anyUnsaved = this.contacts.controls.some(c => c.value._isEditing && !c.get('value')?.valid);
    if (anyUnsaved) return;

    this.isLoading = true;
    this.errorMessage = '';

    const v = this.form.value;
    const payload = {
      firstName:       v.firstName.trim(),
      middleName:      v.middleName.trim(),
      lastName:        v.lastName.trim(),
      civilId:         v.civilId,
      requestedRoleId: Number(v.requestedRoleId),
      password:        v.password,
      contacts:        v.contacts.map(({ _isEditing, _snapshot, ...c }: any) => c),
    };

    this.regSvc.register(payload).subscribe({
      next: () => {
        this.isLoading = false;
        this.router.navigate(['/login'], { queryParams: { registered: '1' } });
      },
      error: (err) => {
        this.isLoading = false;
        this.errorMessage = err?.error?.error ?? err?.error?.message ?? 'Registration failed. Please try again.';
      },
    });
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  hasError(ctrl: string, err: string): boolean {
    const c = this.form.get(ctrl);
    return !!(c?.touched && c?.hasError(err));
  }

  contactFieldError(i: number, field: string): boolean {
    const c = (this.contacts.at(i) as FormGroup).get(field);
    return !!(c?.touched && c?.invalid);
  }

  typeBadge(type: string): string {
    const map: Record<string, string> = {
      'Email':      'bg-blue-100 text-blue-700',
      'Mobile':     'bg-green-100 text-green-700',
      'Work phone': 'bg-purple-100 text-purple-700',
      'Home phone': 'bg-orange-100 text-orange-700',
    };
    return map[type] ?? 'bg-gray-100 text-gray-600';
  }

  valuePlaceholder(type: string): string {
    return type === 'Email' ? 'contact@example.com' : '0512 345 6789';
  }

  roleLabel(name: string): string {
    const map: Record<string, string> = {
      Doctor: 'Doctor', Student: 'Student', Receptionist: 'Receptionist',
      LabTechnician: 'Lab Technician', DentalAssistant: 'Dental Assistant',
      InventoryManager: 'Inventory Manager', Radiologist: 'Radiologist',
    };
    return map[name] ?? name;
  }
}
