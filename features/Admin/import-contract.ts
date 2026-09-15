export const importReasonRequirements = {
  emailRequired: [],
  invalidEmail: [],
  nameRequired: [],
  accessLevelRequired: [],
  unknownAccessLevel: ['slug'],
  invalidExpiration: [],
  unknownCohort: ['slug'],
  cohortNotGranted: ['cohort', 'level'],
  nameAndEmailRequired: [],
  invitationFailed: [],
  accountSetupFailed: [],
  operationFailed: [],
} as const;

export type ImportReasonCode = keyof typeof importReasonRequirements;
export type ImportReasonValues = Record<string, string | number>;

export type ImportReasonDescriptor = {
  reasonCode: ImportReasonCode;
  reasonValues?: ImportReasonValues;
};

export function isImportReasonCode(value: unknown): value is ImportReasonCode {
  return (
    typeof value === 'string' &&
    Object.hasOwn(importReasonRequirements, value)
  );
}
