// Canonical role identifiers used across backend RBAC, frontend guards, and
// JWT payloads. The string VALUES are what land in the `Roles.role_name`
// column and inside JWTs — changing them is a breaking database + token
// migration, not a refactor. Import this enum everywhere instead of
// hardcoding literals so a rename is caught by the compiler.
export enum Role {
  Admin = 'Admin',
  Doctor = 'Doctor',
  Student = 'Student',
  Receptionist = 'Receptionist',
  LabTechnician = 'LabTechnician',
  DentalAssistant = 'DentalAssistant',
  InventoryManager = 'InventoryManager',
  Radiologist = 'Radiologist',
}
