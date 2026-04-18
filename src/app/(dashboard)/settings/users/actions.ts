'use server';

import { revalidatePath } from 'next/cache';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import type { UserRole } from '@/generated/prisma';

export async function updateUserRole(userId: string, newRole: UserRole): Promise<void> {
  const session = await auth();
  if (!session?.user || session.user.role !== 'SUPER_ADMIN') {
    throw new Error('No autorizado');
  }

  const target = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true },
  });
  if (!target) throw new Error('Usuario no encontrado');
  if (target.role === newRole) return;

  if (target.role === 'SUPER_ADMIN' && newRole !== 'SUPER_ADMIN') {
    const superAdminCount = await prisma.user.count({
      where: { role: 'SUPER_ADMIN' },
    });
    if (superAdminCount <= 1) {
      throw new Error('No puede degradar al último SUPER_ADMIN');
    }
  }

  await prisma.user.update({ where: { id: userId }, data: { role: newRole } });
  revalidatePath('/settings/users');
}
