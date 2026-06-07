import type { PrismaClient, Prisma } from '@/generated/prisma/client';

type PrismaOrTx = PrismaClient | Prisma.TransactionClient;

export async function locationHasBodegas(
  client: PrismaOrTx,
  locationId: string,
): Promise<boolean> {
  const count = await client.bodega.count({ where: { locationId } });
  return count > 0;
}
