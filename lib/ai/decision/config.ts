/**
 * Confidence thresholds are provisional Wave 0 values. Plan 15-05 recalibrates
 * them using a calibration split, never the activation holdout split.
 */
export const JEV_CONFIDENCE_THRESHOLDS = {
  taskAndCategory: 0.6,
  folderAndTemplate: 0.5,
} as const;

/** Pre-registered AIDOC-04 activation thresholds; Plan 15-11 persists approved copies in the DB. */
export const JEV_ACTIVATION_THRESHOLDS = {
  minTaskAccuracy: 0.85,
  minFolderTemplateAccuracy: 0.8,
  maxCalibrationError: 0.1,
  maxOrderSensitivityDrop: 0.05,
  minShadowSamples: 200,
  maxShadowErrorRate: 0.05,
  maxShadowLatencyP95Ms: 800,
} as const;

/** Jev timeout in milliseconds; JEV_TIMEOUT_MS may override this in the adapter. */
export const JEV_DEFAULT_TIMEOUT_MS = 2000;
