import type { Prisma } from '@/generated/prisma/client';

type PrismaTx = Prisma.TransactionClient;

/**
 * Formats an asset code as {companyCode}-{prefix}-{seq:5}.
 * No NVH literal — company code is always passed in from the caller.
 */
export function formatAssetCode(
  companyCode: string,
  prefix: string,
  sequence: number,
): string {
  return `${companyCode}-${prefix}-${sequence.toString().padStart(5, '0')}`;
}

/**
 * Atomically increments the CompanyCategorySequence counter and returns
 * the next asset code for the given (company × category) pair.
 *
 * MUST be called inside an existing $transaction — do NOT open a new transaction here.
 * Retries up to 20 times if the generated code already exists (collision loop).
 */
export async function nextAssetCode(
  tx: PrismaTx,
  companyId: string,
  categoryId: string,
  companyCode: string,
  prefix: string,
): Promise<string> {
  let assetCode = '';

  for (let attempt = 0; attempt < 20; attempt++) {
    const seqRow = await tx.companyCategorySequence.upsert({
      where: { companyId_categoryId: { companyId, categoryId } },
      create: { companyId, categoryId, sequence: 1 },
      update: { sequence: { increment: 1 } },
      select: { sequence: true },
    });

    assetCode = formatAssetCode(companyCode, prefix, seqRow.sequence);

    const conflict = await tx.asset.findUnique({
      where: { assetCode },
      select: { id: true },
    });

    if (!conflict) break;
  }

  return assetCode;
}
