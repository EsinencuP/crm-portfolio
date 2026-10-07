import type { Prisma } from "@prisma/client";

export function auditJsonValue(value: unknown): Prisma.InputJsonValue | null {
  if (value === undefined || value === null) return null;
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export function computeChanges(
  oldData: Record<string, unknown>,
  newData: Record<string, unknown>,
  fields: string[],
): Record<string, { old: unknown; new: unknown }> | null {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  for (const field of fields) {
    const oldValue = auditJsonValue(oldData[field]);
    const newValue = auditJsonValue(newData[field]);
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changes[field] = { old: oldValue, new: newValue };
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}
