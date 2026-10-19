import { ManageableLookupCategory, SystemLookupValue } from '../../types/system-lookup';
import { LOOKUP_REGISTRY } from './lookup-registry';
import * as lookupsRepo from '../../repositories/system-lookups.repository';

export async function listCategories(): Promise<ManageableLookupCategory[]> {
  const result: ManageableLookupCategory[] = [];

  for (const entry of LOOKUP_REGISTRY) {
    let count = 0;
    if (entry.source === 'system_lookups') {
      count = await lookupsRepo.countLookupsByCategory(entry.categoryKey);
    } else if (entry.source === 'roles') {
      const roles = await lookupsRepo.getRoles();
      count = roles.length;
    } else if (entry.source === 'appointment_type') {
      const types = await lookupsRepo.getAppointmentTypes();
      count = types.length;
    } else if (entry.source === 'ticket_type') {
      const types = await lookupsRepo.getTicketTypes();
      count = types.length;
    }
    result.push({ ...entry, count });
  }

  return result;
}

export function getCategoryMeta(categoryKey: string) {
  return LOOKUP_REGISTRY.find(r => r.categoryKey === categoryKey) ?? null;
}

export async function listCategoryValues(
  categoryKey: string,
): Promise<{ values: SystemLookupValue[]; extraFields?: string[] }> {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) return { values: [] };

  if (meta.source === 'system_lookups') {
    const rows = await lookupsRepo.getLookupsByCategory(categoryKey);
    return {
      values: rows.map(r => ({
        lookupId:     r.lookup_id,
        categoryKey:  r.category_key,
        valueLabel:   r.value_label,
        displayOrder: r.display_order,
        isActive:     r.is_active,
      })),
    };
  }

  if (meta.source === 'roles') {
    const roles = await lookupsRepo.getRoles();
    return {
      values: roles.map((r, i) => ({
        lookupId:     r.id,
        categoryKey:  'role',
        valueLabel:   r.label,
        displayOrder: i + 1,
        isActive:     r.isActive,
      })),
    };
  }

  if (meta.source === 'appointment_type') {
    const types = await lookupsRepo.getAppointmentTypes();
    return {
      values: types.map((t, i) => ({
        lookupId:     t.type_id,
        categoryKey:  'appointment_type',
        valueLabel:   t.type_name,
        displayOrder: i + 1,
        isActive:     t.is_active,
        duration:     t.duration,
      } as any)),
      extraFields: ['duration'],
    };
  }

  if (meta.source === 'ticket_type') {
    const types = await lookupsRepo.getTicketTypes();
    return {
      values: types.map((t, i) => ({
        lookupId:     t.ticket_type_id,
        categoryKey:  'ticket_type',
        valueLabel:   t.type_name,
        displayOrder: i + 1,
        isActive:     t.is_active,
        description:  t.description,
      } as any)),
      extraFields: ['description'],
    };
  }

  return { values: [] };
}

export async function getPublicValues(categoryKey: string): Promise<SystemLookupValue[] | null> {
  // All system_lookups-backed categories are publicly readable (active values only).
  // Non-system_lookups categories (roles, appointment_type, ticket_type) are not exposed.
  const meta = getCategoryMeta(categoryKey);
  if (!meta || meta.source !== 'system_lookups') return null;

  const rows = await lookupsRepo.getLookupsByCategory(categoryKey, true);
  return rows.map(r => ({
    lookupId:     r.lookup_id,
    categoryKey:  r.category_key,
    valueLabel:   r.value_label,
    displayOrder: r.display_order,
    isActive:     r.is_active,
  }));
}

export async function addValue(
  categoryKey: string,
  data: { valueLabel: string; displayOrder?: number },
  createdBy: number,
): Promise<SystemLookupValue> {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) throw Object.assign(new Error('Unknown category'), { code: 'NOT_FOUND' });
  if (meta.readOnly) throw Object.assign(new Error('This category is read-only'), { code: 'READ_ONLY' });
  if (meta.source !== 'system_lookups') {
    throw Object.assign(new Error('Add via the specific admin API for this source'), { code: 'METHOD_NOT_ALLOWED' });
  }

  const maxOrder   = await lookupsRepo.getMaxDisplayOrder(categoryKey);
  const order      = data.displayOrder ?? maxOrder + 1;
  const row        = await lookupsRepo.insertLookupValue({ categoryKey, valueLabel: data.valueLabel, displayOrder: order, createdBy });

  return {
    lookupId:     row.lookup_id,
    categoryKey:  row.category_key,
    valueLabel:   row.value_label,
    displayOrder: row.display_order,
    isActive:     row.is_active,
  };
}

export async function updateValue(
  categoryKey: string,
  valueId:     number,
  data: { valueLabel?: string; displayOrder?: number; isActive?: boolean; duration?: number; description?: string },
  updatedBy: number,
): Promise<SystemLookupValue | null> {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) throw Object.assign(new Error('Unknown category'), { code: 'NOT_FOUND' });
  if (meta.readOnly) throw Object.assign(new Error('This category is read-only'), { code: 'READ_ONLY' });

  if (meta.source === 'system_lookups') {
    const row = await lookupsRepo.updateLookupValue(valueId, { ...data, updatedBy });
    if (!row) return null;
    return {
      lookupId:     row.lookup_id,
      categoryKey:  row.category_key,
      valueLabel:   row.value_label,
      displayOrder: row.display_order,
      isActive:     row.is_active,
    };
  }

  if (meta.source === 'appointment_type') {
    await lookupsRepo.updateAppointmentType(valueId, {
      typeName:     data.valueLabel,
      duration:     data.duration,
      isActive:     data.isActive,
      displayOrder: data.displayOrder,
    });
    return null;
  }

  if (meta.source === 'ticket_type') {
    await lookupsRepo.updateTicketType(valueId, {
      typeName:     data.valueLabel,
      description:  data.description,
      isActive:     data.isActive,
      displayOrder: data.displayOrder,
    });
    return null;
  }

  return null;
}

export async function deleteValue(
  categoryKey: string,
  valueId:     number,
): Promise<void> {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) throw Object.assign(new Error('Unknown category'), { code: 'NOT_FOUND' });
  if (meta.readOnly) throw Object.assign(new Error('This category is read-only'), { code: 'READ_ONLY' });
  if (meta.source !== 'system_lookups') {
    throw Object.assign(new Error('Delete via the specific admin API for this source'), { code: 'METHOD_NOT_ALLOWED' });
  }

  const deleted = await lookupsRepo.deleteLookupValue(valueId);
  if (!deleted) throw Object.assign(new Error('Value not found'), { code: 'NOT_FOUND' });
}

export async function reorderValues(
  categoryKey: string,
  orderedIds:  number[],
  updatedBy:   number,
): Promise<void> {
  const meta = getCategoryMeta(categoryKey);
  if (!meta) throw Object.assign(new Error('Unknown category'), { code: 'NOT_FOUND' });
  if (meta.readOnly) throw Object.assign(new Error('This category is read-only'), { code: 'READ_ONLY' });

  if (meta.source === 'system_lookups') {
    await lookupsRepo.reorderLookupValues(categoryKey, orderedIds, updatedBy);
    return;
  }
  if (meta.source === 'appointment_type') {
    await lookupsRepo.reorderAppointmentTypes(orderedIds);
    return;
  }
  if (meta.source === 'ticket_type') {
    await lookupsRepo.reorderTicketTypes(orderedIds);
    return;
  }
  throw Object.assign(new Error('Reorder not supported for this source'), { code: 'METHOD_NOT_ALLOWED' });
}
