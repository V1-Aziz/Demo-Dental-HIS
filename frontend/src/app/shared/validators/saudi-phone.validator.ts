import { AbstractControl, ValidationErrors } from '@angular/forms';

const SAUDI_INTL  = /^\+966 ?5\d{1} ?\d{3} ?\d{4}$/;
const SAUDI_LOCAL = /^05\d{1} ?\d{3} ?\d{4}$/;

export function saudiPhoneValidator(control: AbstractControl): ValidationErrors | null {
  if (!control.value) return null;
  const v = String(control.value).trim();
  return SAUDI_INTL.test(v) || SAUDI_LOCAL.test(v) ? null : { saudiPhone: true };
}
