// Business logic for System_Settings. Validates values per key before delegating
// to the repository. Never touches req/res — those stay in the controller.
import {
  getAllSettings,
  getSettingByKey,
  updateSetting,
  SystemSetting,
} from '../repositories/system-settings.repository';
export async function listAllSettingsService(): Promise<SystemSetting[]> {
  return getAllSettings();
}

export async function getSettingService(key: string): Promise<SystemSetting | null> {
  return getSettingByKey(key);
}

// Validates the new value for known keys before persisting.
// Throws a descriptive error (caught by controller → 400) if invalid.
export async function updateSettingService(
  key:       string,
  value:     string,
  updatedBy: number,
): Promise<SystemSetting> {
  const existing = await getSettingByKey(key);
  if (!existing) throw new Error(`SETTING_NOT_FOUND`);

  await updateSetting(key, value, updatedBy);

  return (await getSettingByKey(key))!;
}

