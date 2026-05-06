// Server-only — imports Prisma. Do NOT import from Client Components.

import { prisma } from '@/lib/prisma';
import { writeImportLog } from '@/shared/excel-import/log';
import type { ImportConfirmResult } from '@/shared/excel-import/types';
import type { CategoryImportRow } from './config';

// Mirror the isP2002 helper from categories/actions.ts
function isP2002(e: unknown, target: string): boolean {
  const prismaErr = e as {
    code?: string;
    meta?: { target?: string | string[] };
    message?: string;
  };
  if (prismaErr?.code !== 'P2002') return false;
  const t = prismaErr.meta?.target;
  if (typeof t === 'string') return t.includes(target);
  if (Array.isArray(t)) return t.includes(target);
  // Fallback: MariaDB adapter may omit meta.target — check message
  return (
    typeof prismaErr.message === 'string' && prismaErr.message.includes(target)
  );
}

export async function bulkCreateCategories(
  rows: CategoryImportRow[],
  userId: string,
  fileName: string,
): Promise<ImportConfirmResult> {
  const result: ImportConfirmResult = {
    totalReceived: rows.length,
    created: 0,
    failed: 0,
    errors: [],
  };

  // Pre-resolve all parentName values → parentId in ONE query
  const parentNames = [
    ...new Set(
      rows.map((r) => r.parentName).filter((n): n is string => n != null),
    ),
  ];

  const parents =
    parentNames.length > 0
      ? await prisma.category.findMany({
          where: { name: { in: parentNames } },
          select: { id: true, name: true },
        })
      : [];

  const parentMap = new Map(parents.map((p) => [p.name, p.id]));

  // Row-isolated create loop
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!;

    // Defense in depth: parent should exist (master-validator already checked), but verify id resolution
    if (row.parentName != null && !parentMap.has(row.parentName)) {
      result.failed++;
      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: 'Categoría padre no existe',
      });
      continue;
    }

    const parentId = row.parentName != null ? parentMap.get(row.parentName) : undefined;

    try {
      await prisma.category.create({
        data: {
          name: row.name,
          prefix: row.prefix,
          description: row.description ?? null,
          defaultUsefulLife: row.defaultUsefulLife ?? null,
          sequence: 0,
          // fieldConfig left as undefined — post-import edit via UI
          ...(parentId != null ? { parent: { connect: { id: parentId } } } : {}),
        },
      });
      result.created++;
    } catch (e: unknown) {
      result.failed++;

      let errorMsg: string;
      if (isP2002(e, 'prefix')) {
        errorMsg = 'Prefijo duplicado';
      } else if (isP2002(e, 'name')) {
        errorMsg = 'Nombre duplicado';
      } else {
        errorMsg =
          e instanceof Error ? e.message : 'Error al crear categoría';
      }

      result.errors.push({
        index: i,
        data: row as unknown as Record<string, unknown>,
        error: errorMsg,
      });
    }
  }

  await writeImportLog('Category', result, userId, fileName);

  return result;
}
