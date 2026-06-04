// Smoke-test data generator for the v2 employees Excel import flow.
// Run with: pnpm tsx scripts/smoke-employees-import.ts
// Output:   tmp/empleados-smoke.xlsx  (sheet "Empleados", 6 rows mixing happy + error cases)

import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import * as XLSX from 'xlsx';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

function createClient() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/novahold');
  const adapter = new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
  });
  return new PrismaClient({ adapter });
}

const prisma = createClient();

async function main() {
  const [dept, city, loc, existingEmployee] = await Promise.all([
    prisma.department.findFirst({ select: { name: true } }),
    prisma.city.findFirst({ select: { name: true } }),
    prisma.location.findFirst({ select: { name: true } }),
    prisma.employee.findFirst({ select: { email: true } }),
  ]);

  console.log('── DB context ──');
  console.log('Departamento existente:', dept?.name ?? '(none — DB has no Department rows)');
  console.log('Ciudad existente:      ', city?.name ?? '(none — DB has no City rows)');
  console.log('Sede existente:        ', loc?.name ?? '(none — DB has no Location rows)');
  console.log('Email existente:       ', existingEmployee?.email ?? '(none — DB has no Employee rows)');

  const stamp = Date.now();
  const rows = [
    {
      'Nombre completo*': 'Ana García',
      'Correo*': `ana.smoke.${stamp}@empresa.com`,
      'Teléfono': '+57 300 123 4567',
      'Cargo': 'Analista',
      'Departamento': dept?.name ?? '',
      'Ciudad': city?.name ?? '',
      'Sede': loc?.name ?? '',
      'Activo': 'SI',
    },
    {
      'Nombre completo*': 'Bruno Pérez (mínimo)',
      'Correo*': `bruno.smoke.${stamp}@empresa.com`,
      'Teléfono': '',
      'Cargo': '',
      'Departamento': '',
      'Ciudad': '',
      'Sede': '',
      'Activo': '',
    },
    {
      'Nombre completo*': 'Carla Rojas (dept malo)',
      'Correo*': `carla.smoke.${stamp}@empresa.com`,
      'Teléfono': '',
      'Cargo': 'QA',
      'Departamento': 'Departamento Inexistente XYZ',
      'Ciudad': city?.name ?? '',
      'Sede': loc?.name ?? '',
      'Activo': 'SI',
    },
    {
      'Nombre completo*': 'Diego Martínez (ciudad mala)',
      'Correo*': `diego.smoke.${stamp}@empresa.com`,
      'Teléfono': '',
      'Cargo': 'Dev',
      'Departamento': dept?.name ?? '',
      'Ciudad': 'Ciudad Inexistente XYZ',
      'Sede': loc?.name ?? '',
      'Activo': 'SI',
    },
    {
      'Nombre completo*': 'Elena Suárez (sede mala)',
      'Correo*': `elena.smoke.${stamp}@empresa.com`,
      'Teléfono': '',
      'Cargo': 'PM',
      'Departamento': dept?.name ?? '',
      'Ciudad': city?.name ?? '',
      'Sede': 'Sede Inexistente XYZ',
      'Activo': 'SI',
    },
    {
      'Nombre completo*': 'Fernando López (email duplicado)',
      'Correo*': existingEmployee?.email ?? `bruno.smoke.${stamp}@empresa.com`,
      'Teléfono': '',
      'Cargo': '',
      'Departamento': '',
      'Ciudad': '',
      'Sede': '',
      'Activo': 'SI',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Empleados');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const outPath = resolve('tmp/empleados-smoke.xlsx');
  writeFileSync(outPath, buf);

  console.log(`\n✓ Wrote ${rows.length} rows to ${outPath}`);
  console.log('\nExpected preview result:');
  console.log('  - Row 1 (Ana):     valid' + (dept ? '' : ' (only if DB has a Department)'));
  console.log('  - Row 2 (Bruno):   valid (minimal — all optionals blank)');
  console.log('  - Row 3 (Carla):   error — "Departamento no existe"');
  console.log('  - Row 4 (Diego):   error — "Ciudad no existe"');
  console.log('  - Row 5 (Elena):   error — "Sede no existe"');
  console.log('  - Row 6 (Fernando):' + (existingEmployee ? ' error — "Correo duplicado"' : ' valid (no existing email to clash with)'));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
