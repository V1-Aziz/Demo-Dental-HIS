export interface SystemLookupValue {
  lookupId: number;
  categoryKey: string;
  valueLabel: string;
  displayOrder: number;
  isActive: boolean;
}

export interface ManageableLookupCategory {
  categoryKey: string;
  displayName: string;
  description: string;
  source: 'system_lookups' | 'roles' | 'appointment_type' | 'ticket_type';
  readOnly: boolean;
  count: number;
}

export interface CreateLookupValueBody {
  categoryKey: string;
  valueLabel: string;
  displayOrder?: number;
}

export interface UpdateLookupValueBody {
  valueLabel?: string;
  displayOrder?: number;
  isActive?: boolean;
  duration?: number;
  description?: string;
}

export interface ReorderLookupValuesBody {
  categoryKey: string;
  orderedIds: number[];
}
