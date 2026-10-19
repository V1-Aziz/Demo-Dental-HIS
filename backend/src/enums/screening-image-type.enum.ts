// Canonical list of screening image types. The STRING VALUES must match the
// CK_Screening_ImageType CHECK constraint in database/schema.sql. Changing a
// value is a breaking DB change, not a refactor — always import this enum
// instead of hardcoding literals.
export enum ScreeningImageType {
  PANORAMIC       = 'Panoramic (OPG)',
  PERIAPICAL      = 'Periapical (PA)',
  BITEWING        = 'Bitewing (BW)',
  OCCLUSAL        = 'Occlusal',
  CEPHALOMETRIC   = 'Cephalometric',
  CBCT            = 'CBCT',
  INTRAORAL_PHOTO = 'Intraoral Photo',
  EXTRAORAL_PHOTO = 'Extraoral Photo',
}

export const SCREENING_IMAGE_TYPES: ScreeningImageType[] = [
  ScreeningImageType.PANORAMIC,
  ScreeningImageType.PERIAPICAL,
  ScreeningImageType.BITEWING,
  ScreeningImageType.OCCLUSAL,
  ScreeningImageType.CEPHALOMETRIC,
  ScreeningImageType.CBCT,
  ScreeningImageType.INTRAORAL_PHOTO,
  ScreeningImageType.EXTRAORAL_PHOTO,
];

// Types that meaningfully take a tooth number. Panoramic / Ceph / CBCT /
// Extraoral are whole-arch or whole-head imaging — no tooth number applies.
export const SCREENING_TYPES_WITH_TOOTH: ScreeningImageType[] = [
  ScreeningImageType.PERIAPICAL,
  ScreeningImageType.BITEWING,
  ScreeningImageType.OCCLUSAL,
  ScreeningImageType.INTRAORAL_PHOTO,
];
