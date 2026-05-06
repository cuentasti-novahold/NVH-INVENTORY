import { prisma } from '@/lib/prisma';
import type { Prisma } from '@/generated/prisma/client';
import type { ImportConfirmResult } from './types';

/**
 * Write a single ImportLog row after a confirm operation.
 * Owns the `as unknown as Prisma.InputJsonValue` cast for the errors JSON column.
 * Status: FAILED only when totalReceived > 0 AND created === 0; otherwise COMPLETED.
 */
export async function writeImportLog(
  entity: string,
  result: ImportConfirmResult,
  userId: string,
  fileName: string,
): Promise<void> {
  await prisma.importLog.create({
    data: {
      userId,
      entity,
      fileName,
      totalRows: result.totalReceived,
      successRows: result.created,
      errorRows: result.failed,
      errors:
        result.errors.length > 0
          ? (result.errors as unknown as Prisma.InputJsonValue)
          : undefined,
      status: result.totalReceived > 0 && result.created === 0 ? 'FAILED' : 'COMPLETED',
    },
  });
}
