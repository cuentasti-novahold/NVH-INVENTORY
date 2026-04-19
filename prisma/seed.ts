import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pad(n: number) {
  return String(n).padStart(5, '0');
}

function rnd<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function daysAgo(n: number) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d;
}

// ─── Seed ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🌱 Seeding database...');

  // ── 1. Country ──────────────────────────────────────────────────────────────
  const colombia = await prisma.country.upsert({
    where: { code: 'CO' },
    update: {},
    create: { name: 'Colombia', code: 'CO' },
  });

  // ── 2. Cities ───────────────────────────────────────────────────────────────
  const [bogota, medellin, cali, barranquilla] = await Promise.all([
    prisma.city.upsert({ where: { name_countryId: { name: 'Bogotá', countryId: colombia.id } }, update: {}, create: { name: 'Bogotá', countryId: colombia.id } }),
    prisma.city.upsert({ where: { name_countryId: { name: 'Medellín', countryId: colombia.id } }, update: {}, create: { name: 'Medellín', countryId: colombia.id } }),
    prisma.city.upsert({ where: { name_countryId: { name: 'Cali', countryId: colombia.id } }, update: {}, create: { name: 'Cali', countryId: colombia.id } }),
    prisma.city.upsert({ where: { name_countryId: { name: 'Barranquilla', countryId: colombia.id } }, update: {}, create: { name: 'Barranquilla', countryId: colombia.id } }),
  ]);

  // ── 3. Locations ────────────────────────────────────────────────────────────
  const locBogota = await prisma.location.upsert({ where: { id: 'loc-bogota-principal' }, update: {}, create: { id: 'loc-bogota-principal', name: 'Sede Principal Bogotá', address: 'Cra 7 # 32-16, Bogotá', cityId: bogota.id } });
  const locBogotaNorte = await prisma.location.upsert({ where: { id: 'loc-bogota-norte' }, update: {}, create: { id: 'loc-bogota-norte', name: 'Sede Norte Bogotá', address: 'Cra 15 # 93-47, Bogotá', cityId: bogota.id } });
  const locMedellin = await prisma.location.upsert({ where: { id: 'loc-medellin' }, update: {}, create: { id: 'loc-medellin', name: 'Sede Medellín', address: 'Calle 10 # 43-23, El Poblado, Medellín', cityId: medellin.id } });
  const locCali = await prisma.location.upsert({ where: { id: 'loc-cali' }, update: {}, create: { id: 'loc-cali', name: 'Sede Cali', address: 'Av. Roosevelt # 38-12, Cali', cityId: cali.id } });

  // ── 4. Bodegas ──────────────────────────────────────────────────────────────
  const bodBogota = await prisma.bodega.upsert({ where: { id: 'bod-bogota' }, update: {}, create: { id: 'bod-bogota', name: 'Bodega Bogotá Principal', locationId: locBogota.id } });
  const bodNorte = await prisma.bodega.upsert({ where: { id: 'bod-norte' }, update: {}, create: { id: 'bod-norte', name: 'Bodega Norte', locationId: locBogotaNorte.id } });
  const bodMedellin = await prisma.bodega.upsert({ where: { id: 'bod-medellin' }, update: {}, create: { id: 'bod-medellin', name: 'Bodega Medellín', locationId: locMedellin.id } });
  const bodCali = await prisma.bodega.upsert({ where: { id: 'bod-cali' }, update: {}, create: { id: 'bod-cali', name: 'Bodega Cali', locationId: locCali.id } });

  const locations = [locBogota, locBogotaNorte, locMedellin, locCali];
  const bodegas = [bodBogota, bodNorte, bodMedellin, bodCali];
  const cities = [bogota, medellin, cali, barranquilla];

  // ── 5. Departments ──────────────────────────────────────────────────────────
  const deptNames = ['Tecnología', 'Recursos Humanos', 'Contabilidad', 'Ventas', 'Operaciones', 'Gerencia'];
  const depts: Record<string, { id: string }> = {};
  for (const name of deptNames) {
    const d = await prisma.department.upsert({ where: { name }, update: {}, create: { name } });
    depts[name] = d;
  }

  // ── 6. Currencies + Exchange Rates ──────────────────────────────────────────
  const cop = await prisma.currency.upsert({ where: { code: 'COP' }, update: {}, create: { code: 'COP', name: 'Peso Colombiano', symbol: '$', isBase: true } });
  const usd = await prisma.currency.upsert({ where: { code: 'USD' }, update: {}, create: { code: 'USD', name: 'Dólar Estadounidense', symbol: 'USD', isBase: false } });
  const eur = await prisma.currency.upsert({ where: { code: 'EUR' }, update: {}, create: { code: 'EUR', name: 'Euro', symbol: '€', isBase: false } });

  await prisma.exchangeRate.upsert({ where: { id: 'er-usd-2025' }, update: { rateToBase: 4150 }, create: { id: 'er-usd-2025', currencyId: usd.id, rateToBase: 4150, effectiveDate: new Date('2025-01-01'), source: 'Banco de la República' } });
  await prisma.exchangeRate.upsert({ where: { id: 'er-eur-2025' }, update: { rateToBase: 4520 }, create: { id: 'er-eur-2025', currencyId: eur.id, rateToBase: 4520, effectiveDate: new Date('2025-01-01'), source: 'Banco de la República' } });

  // ── 7. Categories ───────────────────────────────────────────────────────────
  const allHidden = { processor: 'hidden', ram: 'hidden', storageCapacity: 'hidden', storageType: 'hidden', operatingSystem: 'hidden', phoneNumber: 'hidden', imei: 'hidden' };
  const pcConfig = { processor: 'required', ram: 'required', storageCapacity: 'required', storageType: 'required', operatingSystem: 'required', phoneNumber: 'hidden', imei: 'hidden' };
  const phnConfig = { processor: 'hidden', ram: 'hidden', storageCapacity: 'optional', storageType: 'hidden', operatingSystem: 'hidden', phoneNumber: 'required', imei: 'optional' };
  const extConfig = { processor: 'hidden', ram: 'hidden', storageCapacity: 'required', storageType: 'required', operatingSystem: 'hidden', phoneNumber: 'hidden', imei: 'hidden' };

  const catDefs = [
    { id: 'cat-pc',   name: 'Computador Portátil',  prefix: 'PC',   fieldConfig: pcConfig,  defaultUsefulLife: 4 },
    { id: 'cat-dsk',  name: 'Computador Escritorio', prefix: 'DSK',  fieldConfig: pcConfig,  defaultUsefulLife: 5 },
    { id: 'cat-mon',  name: 'Monitor',               prefix: 'MON',  fieldConfig: allHidden, defaultUsefulLife: 5 },
    { id: 'cat-kb',   name: 'Teclado',               prefix: 'KB',   fieldConfig: allHidden, defaultUsefulLife: 3 },
    { id: 'cat-mse',  name: 'Mouse',                 prefix: 'MSE',  fieldConfig: allHidden, defaultUsefulLife: 3 },
    { id: 'cat-chg',  name: 'Cargador',              prefix: 'CHG',  fieldConfig: allHidden, defaultUsefulLife: 2 },
    { id: 'cat-phn',  name: 'Celular Empresa',       prefix: 'PHN',  fieldConfig: phnConfig, defaultUsefulLife: 3 },
    { id: 'cat-ext',  name: 'Disco Externo',         prefix: 'EXT',  fieldConfig: extConfig, defaultUsefulLife: 3 },
    { id: 'cat-rj45', name: 'Adaptador RJ45',        prefix: 'RJ45', fieldConfig: allHidden, defaultUsefulLife: 2 },
    { id: 'cat-hdst', name: 'Diadema',               prefix: 'HDST', fieldConfig: allHidden, defaultUsefulLife: 2 },
    { id: 'cat-erg',  name: 'Ergonómico',            prefix: 'ERG',  fieldConfig: allHidden, defaultUsefulLife: 5 },
  ];

  const cats: Record<string, { id: string; prefix: string }> = {};
  for (const def of catDefs) {
    const c = await prisma.category.upsert({
      where: { id: def.id },
      update: { fieldConfig: def.fieldConfig },
      create: { id: def.id, name: def.name, prefix: def.prefix, fieldConfig: def.fieldConfig, defaultUsefulLife: def.defaultUsefulLife, sequence: 0 },
    });
    cats[def.prefix] = c;
  }

  // ── 8. Users ────────────────────────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({ where: { email: 'admin@novahold.com' }, update: {}, create: { id: 'user-admin', name: 'Administrador Principal', email: 'admin@novahold.com', role: 'SUPER_ADMIN' } });
  const adminUser2 = await prisma.user.upsert({ where: { email: 'it.admin@novahold.com' }, update: {}, create: { id: 'user-it-admin', name: 'Carlos Velasco', email: 'it.admin@novahold.com', role: 'ADMIN' } });
  const managerUser = await prisma.user.upsert({ where: { email: 'gerente@novahold.com' }, update: {}, create: { id: 'user-manager', name: 'Laura Jiménez', email: 'gerente@novahold.com', role: 'MANAGER' } });
  await prisma.user.upsert({ where: { email: 'tecnico@novahold.com' }, update: {}, create: { id: 'user-tech', name: 'Andrés Morales', email: 'tecnico@novahold.com', role: 'TECHNICIAN' } });
  await prisma.user.upsert({ where: { email: 'viewer@novahold.com' }, update: {}, create: { id: 'user-viewer', name: 'Visitante', email: 'viewer@novahold.com', role: 'VIEWER' } });

  // ── 9. Employees ────────────────────────────────────────────────────────────
  const employeeData = [
    { id: 'emp-01', fullName: 'Ana María Torres',      email: 'a.torres@novahold.com',      position: 'Gerente General',         dept: 'Gerencia',          city: bogota,        loc: locBogota },
    { id: 'emp-02', fullName: 'Juan Pablo Rincón',     email: 'jp.rincon@novahold.com',     position: 'Director de TI',          dept: 'Tecnología',        city: bogota,        loc: locBogota },
    { id: 'emp-03', fullName: 'Valentina Herrera',     email: 'v.herrera@novahold.com',     position: 'Desarrolladora Senior',   dept: 'Tecnología',        city: bogota,        loc: locBogota },
    { id: 'emp-04', fullName: 'Sebastián Castro',      email: 's.castro@novahold.com',      position: 'Desarrollador Junior',    dept: 'Tecnología',        city: bogota,        loc: locBogotaNorte },
    { id: 'emp-05', fullName: 'Daniela Ospina',        email: 'd.ospina@novahold.com',      position: 'Diseñadora UX',           dept: 'Tecnología',        city: bogota,        loc: locBogotaNorte },
    { id: 'emp-06', fullName: 'Camilo Vargas',         email: 'c.vargas@novahold.com',      position: 'Analista Contable',       dept: 'Contabilidad',      city: bogota,        loc: locBogota },
    { id: 'emp-07', fullName: 'Mariana Salazar',       email: 'm.salazar@novahold.com',     position: 'Coordinadora RRHH',       dept: 'Recursos Humanos',  city: bogota,        loc: locBogota },
    { id: 'emp-08', fullName: 'Andrés Felipe Gómez',   email: 'af.gomez@novahold.com',      position: 'Ejecutivo de Ventas',     dept: 'Ventas',            city: medellin,      loc: locMedellin },
    { id: 'emp-09', fullName: 'Laura Cristina Mejía',  email: 'lc.mejia@novahold.com',      position: 'Gerente Regional',        dept: 'Gerencia',          city: medellin,      loc: locMedellin },
    { id: 'emp-10', fullName: 'Diego Alejandro Ríos',  email: 'da.rios@novahold.com',       position: 'Ingeniero de Soporte',    dept: 'Tecnología',        city: medellin,      loc: locMedellin },
    { id: 'emp-11', fullName: 'Natalia Pedraza',       email: 'n.pedraza@novahold.com',     position: 'Analista de Operaciones', dept: 'Operaciones',       city: cali,          loc: locCali },
    { id: 'emp-12', fullName: 'Julián Estrada',        email: 'j.estrada@novahold.com',     position: 'Jefe de Bodega',          dept: 'Operaciones',       city: cali,          loc: locCali },
    { id: 'emp-13', fullName: 'Paola Arbeláez',        email: 'p.arbelaez@novahold.com',    position: 'Vendedora Senior',        dept: 'Ventas',            city: cali,          loc: locCali },
    { id: 'emp-14', fullName: 'Ricardo Montoya',       email: 'r.montoya@novahold.com',     position: 'Contador',                dept: 'Contabilidad',      city: bogota,        loc: locBogota },
    { id: 'emp-15', fullName: 'Sofía Rodríguez',       email: 's.rodriguez@novahold.com',   position: 'Asistente Administrativa', dept: 'Gerencia',         city: bogota,        loc: locBogotaNorte },
    { id: 'emp-16', fullName: 'Esteban Zuluaga',       email: 'e.zuluaga@novahold.com',     position: 'DevOps Engineer',         dept: 'Tecnología',        city: medellin,      loc: locMedellin },
    { id: 'emp-17', fullName: 'Mónica Cardona',        email: 'm.cardona@novahold.com',     position: 'Analista de Datos',       dept: 'Tecnología',        city: bogota,        loc: locBogota },
    { id: 'emp-18', fullName: 'Felipe Gutiérrez',      email: 'f.gutierrez@novahold.com',   position: 'Técnico de Soporte',      dept: 'Tecnología',        city: barranquilla,  loc: locCali },
    { id: 'emp-19', fullName: 'Isabella Martínez',     email: 'i.martinez@novahold.com',    position: 'Representante Legal',     dept: 'Gerencia',          city: bogota,        loc: locBogota },
    { id: 'emp-20', fullName: 'Tomás Echeverri',       email: 't.echeverri@novahold.com',   position: 'Ejecutivo de Cuenta',     dept: 'Ventas',            city: medellin,      loc: locMedellin },
  ];

  const employees: Record<string, { id: string }> = {};
  for (const e of employeeData) {
    const emp = await prisma.employee.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        fullName: e.fullName,
        email: e.email,
        position: e.position,
        departmentId: depts[e.dept].id,
        cityId: e.city.id,
        locationId: e.loc.id,
        isActive: true,
      },
    });
    employees[e.id] = emp;
  }

  // ── 10. Assets ──────────────────────────────────────────────────────────────
  // Helper: build asset code
  function assetCode(prefix: string, seq: number) {
    return `NVH-${prefix}-${pad(seq)}`;
  }

  const assetDefs = [
    // Computadores portátiles (10)
    { id: 'ast-pc-01', prefix: 'PC', seq: 1,  brand: 'Lenovo',  model: 'ThinkPad X1 Carbon',   serial: 'SN-LNV-001', processor: 'Intel Core i7-1260P', ram: '16GB', storageCapacity: '512GB', storageType: 'NVME', operatingSystem: 'Windows 11 Pro', purchasePrice: 1200, currency: 'USD', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-pc-02', prefix: 'PC', seq: 2,  brand: 'Lenovo',  model: 'ThinkPad E15 Gen 4',   serial: 'SN-LNV-002', processor: 'AMD Ryzen 5 5625U',   ram: '8GB',  storageCapacity: '256GB', storageType: 'SSD',  operatingSystem: 'Windows 11 Home', purchasePrice: 850,  currency: 'USD', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-pc-03', prefix: 'PC', seq: 3,  brand: 'Dell',    model: 'Latitude 5520',         serial: 'SN-DEL-001', processor: 'Intel Core i5-1145G7', ram: '16GB', storageCapacity: '512GB', storageType: 'SSD',  operatingSystem: 'Windows 11 Pro', purchasePrice: 980,  currency: 'USD', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-pc-04', prefix: 'PC', seq: 4,  brand: 'Dell',    model: 'Latitude 5530',         serial: 'SN-DEL-002', processor: 'Intel Core i7-1255U',  ram: '32GB', storageCapacity: '1TB',   storageType: 'NVME', operatingSystem: 'Windows 11 Pro', purchasePrice: 1350, currency: 'USD', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-pc-05', prefix: 'PC', seq: 5,  brand: 'HP',      model: 'EliteBook 840 G9',      serial: 'SN-HP-001',  processor: 'Intel Core i5-1235U',  ram: '16GB', storageCapacity: '512GB', storageType: 'NVME', operatingSystem: 'Windows 11 Pro', purchasePrice: 1100, currency: 'USD', loc: locMedellin,   bodega: bodMedellin },
    { id: 'ast-pc-06', prefix: 'PC', seq: 6,  brand: 'HP',      model: 'ProBook 450 G9',        serial: 'SN-HP-002',  processor: 'Intel Core i7-1255U',  ram: '16GB', storageCapacity: '512GB', storageType: 'SSD',  operatingSystem: 'Windows 11 Pro', purchasePrice: 1050, currency: 'USD', loc: locMedellin,   bodega: bodMedellin },
    { id: 'ast-pc-07', prefix: 'PC', seq: 7,  brand: 'Apple',   model: 'MacBook Pro 14" M3',    serial: 'SN-APL-001', processor: 'Apple M3 Pro',         ram: '18GB', storageCapacity: '512GB', storageType: 'NVME', operatingSystem: 'macOS Sonoma',   purchasePrice: 2100, currency: 'USD', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-pc-08', prefix: 'PC', seq: 8,  brand: 'Apple',   model: 'MacBook Air 13" M2',    serial: 'SN-APL-002', processor: 'Apple M2',             ram: '8GB',  storageCapacity: '256GB', storageType: 'NVME', operatingSystem: 'macOS Sonoma',   purchasePrice: 1300, currency: 'USD', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-pc-09', prefix: 'PC', seq: 9,  brand: 'Lenovo',  model: 'IdeaPad 5 Pro',         serial: 'SN-LNV-003', processor: 'AMD Ryzen 7 5800H',    ram: '16GB', storageCapacity: '512GB', storageType: 'NVME', operatingSystem: 'Windows 11 Home', purchasePrice: 950,  currency: 'USD', loc: locCali,       bodega: bodCali },
    { id: 'ast-pc-10', prefix: 'PC', seq: 10, brand: 'Dell',    model: 'XPS 13 9315',           serial: 'SN-DEL-003', processor: 'Intel Core i7-1250U',  ram: '16GB', storageCapacity: '512GB', storageType: 'NVME', operatingSystem: 'Windows 11 Pro', purchasePrice: 1400, currency: 'USD', loc: locCali,       bodega: bodCali },
    // Monitores (5)
    { id: 'ast-mon-01', prefix: 'MON', seq: 1, brand: 'LG',     model: 'UltraWide 29WP500',     serial: 'SN-LG-001',  purchasePrice: 799000,  currency: 'COP', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-mon-02', prefix: 'MON', seq: 2, brand: 'LG',     model: '27UK850-W 4K',          serial: 'SN-LG-002',  purchasePrice: 1200000, currency: 'COP', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-mon-03', prefix: 'MON', seq: 3, brand: 'Samsung', model: 'ViewFinity S8 32"',    serial: 'SN-SAM-001', purchasePrice: 1500000, currency: 'COP', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-mon-04', prefix: 'MON', seq: 4, brand: 'Dell',   model: 'P2423D',                serial: 'SN-DEL-MON-01', purchasePrice: 890000, currency: 'COP', loc: locMedellin,  bodega: bodMedellin },
    { id: 'ast-mon-05', prefix: 'MON', seq: 5, brand: 'BenQ',   model: 'PD2705U',               serial: 'SN-BNQ-001', purchasePrice: 1100000, currency: 'COP', loc: locCali,       bodega: bodCali },
    // Teclados y mouse (6)
    { id: 'ast-kb-01',  prefix: 'KB',  seq: 1, brand: 'Logitech', model: 'MX Keys Advanced',   serial: 'SN-LOG-KB-01', purchasePrice: 350000, currency: 'COP', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-kb-02',  prefix: 'KB',  seq: 2, brand: 'Logitech', model: 'K380',               serial: 'SN-LOG-KB-02', purchasePrice: 180000, currency: 'COP', loc: locBogota,     bodega: bodBogota },
    { id: 'ast-kb-03',  prefix: 'KB',  seq: 3, brand: 'Microsoft', model: 'Ergonomic Keyboard', serial: 'SN-MSF-KB-01', purchasePrice: 220000, currency: 'COP', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-mse-01', prefix: 'MSE', seq: 1, brand: 'Logitech', model: 'MX Master 3S',       serial: 'SN-LOG-MSE-01', purchasePrice: 280000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-mse-02', prefix: 'MSE', seq: 2, brand: 'Logitech', model: 'M705',               serial: 'SN-LOG-MSE-02', purchasePrice: 120000, currency: 'COP', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-mse-03', prefix: 'MSE', seq: 3, brand: 'Microsoft', model: 'Arc Mouse',         serial: 'SN-MSF-MSE-01', purchasePrice: 150000, currency: 'COP', loc: locMedellin,  bodega: bodMedellin },
    // Celulares (3)
    { id: 'ast-phn-01', prefix: 'PHN', seq: 1, brand: 'Samsung', model: 'Galaxy S24',          serial: 'SN-SAM-PHN-01', phoneNumber: '3001234567', purchasePrice: 850,  currency: 'USD', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-phn-02', prefix: 'PHN', seq: 2, brand: 'Apple',   model: 'iPhone 15 Pro',       serial: 'SN-APL-PHN-01', phoneNumber: '3109876543', purchasePrice: 1200, currency: 'USD', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-phn-03', prefix: 'PHN', seq: 3, brand: 'Xiaomi',  model: 'Redmi Note 13 Pro',   serial: 'SN-XIR-PHN-01', phoneNumber: '3205551234', purchasePrice: 380,  currency: 'USD', loc: locMedellin,  bodega: bodMedellin },
    // Discos externos (3)
    { id: 'ast-ext-01', prefix: 'EXT', seq: 1, brand: 'WD',     model: 'My Passport 2TB',      serial: 'SN-WD-001',  storageCapacity: '2TB', storageType: 'HDD', purchasePrice: 220000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-ext-02', prefix: 'EXT', seq: 2, brand: 'Seagate', model: 'Backup Plus 1TB',     serial: 'SN-SEG-001', storageCapacity: '1TB', storageType: 'HDD', purchasePrice: 160000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-ext-03', prefix: 'EXT', seq: 3, brand: 'Samsung', model: 'T7 SSD 500GB',        serial: 'SN-SAM-EXT-01', storageCapacity: '500GB', storageType: 'SSD', purchasePrice: 280000, currency: 'COP', loc: locMedellin, bodega: bodMedellin },
    // Cargadores (3)
    { id: 'ast-chg-01', prefix: 'CHG', seq: 1, brand: 'Lenovo',  model: 'ThinkPad 65W USB-C',  serial: 'SN-LNV-CHG-01', purchasePrice: 180000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-chg-02', prefix: 'CHG', seq: 2, brand: 'Dell',    model: 'DA90PM111 90W',       serial: 'SN-DEL-CHG-01', purchasePrice: 220000, currency: 'COP', loc: locBogotaNorte, bodega: bodNorte },
    { id: 'ast-chg-03', prefix: 'CHG', seq: 3, brand: 'Apple',   model: 'USB-C 96W MagSafe 3', serial: 'SN-APL-CHG-01', purchasePrice: 350000, currency: 'COP', loc: locMedellin,  bodega: bodMedellin },
    // Diademas (2)
    { id: 'ast-hdst-01', prefix: 'HDST', seq: 1, brand: 'Jabra',  model: 'Evolve2 55',         serial: 'SN-JBR-001', purchasePrice: 420000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-hdst-02', prefix: 'HDST', seq: 2, brand: 'Logitech', model: 'H800 Bluetooth',  serial: 'SN-LOG-HS-01', purchasePrice: 250000, currency: 'COP', loc: locMedellin, bodega: bodMedellin },
    // Ergonómicos (2)
    { id: 'ast-erg-01', prefix: 'ERG', seq: 1, brand: 'Humanscale', model: 'Freedom Chair',   serial: 'SN-HUM-001', purchasePrice: 1800000, currency: 'COP', loc: locBogota,    bodega: bodBogota },
    { id: 'ast-erg-02', prefix: 'ERG', seq: 2, brand: 'Herman Miller', model: 'Aeron Size B', serial: 'SN-HRM-001', purchasePrice: 3500000, currency: 'COP', loc: locBogotaNorte, bodega: bodNorte },
  ] as const;

  const USD_RATE = 4150;
  const assets: Record<string, { id: string }> = {};

  for (const a of assetDefs) {
    const purchasePriceBase = a.purchasePrice != null
      ? (a.currency === 'USD' ? a.purchasePrice * USD_RATE : a.purchasePrice)
      : null;

    const ast = await prisma.asset.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        assetCode: assetCode(a.prefix, a.seq),
        categoryId: cats[a.prefix].id,
        brand: 'brand' in a ? (a as { brand?: string }).brand ?? null : null,
        model: 'model' in a ? (a as { model?: string }).model ?? null : null,
        serialNumber: 'serial' in a ? (a as { serial?: string }).serial ?? null : null,
        processor: 'processor' in a ? (a as { processor?: string }).processor ?? null : null,
        ram: 'ram' in a ? (a as { ram?: string }).ram ?? null : null,
        storageCapacity: 'storageCapacity' in a ? (a as { storageCapacity?: string }).storageCapacity ?? null : null,
        storageType: 'storageType' in a ? (a as { storageType?: string }).storageType as 'SSD' | 'HDD' | 'NVME' | 'EMMC' | undefined ?? null : null,
        operatingSystem: 'operatingSystem' in a ? (a as { operatingSystem?: string }).operatingSystem ?? null : null,
        phoneNumber: 'phoneNumber' in a ? (a as { phoneNumber?: string }).phoneNumber ?? null : null,
        purchasePrice: a.purchasePrice ?? null,
        currencyCode: a.currency,
        purchasePriceBase: purchasePriceBase,
        usefulLifeYears: catDefs.find(c => c.prefix === a.prefix)?.defaultUsefulLife ?? null,
        purchaseDate: daysAgo(Math.floor(Math.random() * 365 * 2 + 60)),
        generalStatus: 'GOOD',
        functionalStatus: 'GOOD',
        locationId: a.loc.id,
        bodegaId: a.bodega.id,
        isActive: true,
      },
    });
    assets[a.id] = ast;
  }

  // ── 11. Assignments ─────────────────────────────────────────────────────────
  const assignmentDefs = [
    // ACTIVE — portátiles asignados a empleados
    { id: 'asgn-01', assetId: 'ast-pc-01', empId: 'emp-02', daysBack: 90,  status: 'ACTIVE',    deliveredBy: adminUser2.id },
    { id: 'asgn-02', assetId: 'ast-pc-02', empId: 'emp-03', daysBack: 120, status: 'ACTIVE',    deliveredBy: adminUser2.id },
    { id: 'asgn-03', assetId: 'ast-pc-03', empId: 'emp-04', daysBack: 60,  status: 'ACTIVE',    deliveredBy: adminUser2.id },
    { id: 'asgn-04', assetId: 'ast-pc-05', empId: 'emp-10', daysBack: 45,  status: 'ACTIVE',    deliveredBy: adminUser2.id },
    { id: 'asgn-05', assetId: 'ast-pc-07', empId: 'emp-01', daysBack: 180, status: 'ACTIVE',    deliveredBy: adminUser.id },
    { id: 'asgn-06', assetId: 'ast-pc-08', empId: 'emp-17', daysBack: 30,  status: 'ACTIVE',    deliveredBy: adminUser2.id },
    { id: 'asgn-07', assetId: 'ast-phn-01', empId: 'emp-08', daysBack: 200, status: 'ACTIVE',   deliveredBy: adminUser.id },
    { id: 'asgn-08', assetId: 'ast-phn-02', empId: 'emp-09', daysBack: 150, status: 'ACTIVE',   deliveredBy: adminUser.id },
    // RETURNED — equipos devueltos
    { id: 'asgn-09', assetId: 'ast-pc-04', empId: 'emp-15', daysBack: 200, status: 'RETURNED',  deliveredBy: adminUser2.id, returnedDaysBack: 10 },
    { id: 'asgn-10', assetId: 'ast-pc-06', empId: 'emp-12', daysBack: 300, status: 'RETURNED',  deliveredBy: adminUser.id,  returnedDaysBack: 30 },
    { id: 'asgn-11', assetId: 'ast-phn-03', empId: 'emp-20', daysBack: 250, status: 'RETURNED', deliveredBy: adminUser.id,  returnedDaysBack: 5 },
    // TRANSFERRED
    { id: 'asgn-12', assetId: 'ast-pc-09', empId: 'emp-13', daysBack: 180, status: 'TRANSFERRED', deliveredBy: adminUser2.id, returnedDaysBack: 60 },
  ] as const;

  for (const a of assignmentDefs) {
    await prisma.assignment.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        assetId: assets[a.assetId].id,
        employeeId: employees[a.empId].id,
        assignedAt: daysAgo(a.daysBack),
        returnedAt: 'returnedDaysBack' in a ? daysAgo((a as { returnedDaysBack: number }).returnedDaysBack) : null,
        deliveredById: a.deliveredBy,
        status: a.status as 'ACTIVE' | 'RETURNED' | 'TRANSFERRED',
        notes: null,
      },
    });
  }

  // Nueva asignación del pc-09 tras la transferencia (ACTIVE para emp-16)
  await prisma.assignment.upsert({
    where: { id: 'asgn-13' },
    update: {},
    create: {
      id: 'asgn-13',
      assetId: assets['ast-pc-09'].id,
      employeeId: employees['emp-16'].id,
      assignedAt: daysAgo(55),
      deliveredById: adminUser2.id,
      status: 'ACTIVE',
      notes: 'Transferido desde Paola Arbeláez',
    },
  });

  console.log('✅ Seed completado:');
  console.log(`   • 1 país, 4 ciudades, 4 sedes, 4 bodegas`);
  console.log(`   • 6 departamentos`);
  console.log(`   • 3 monedas + 2 tasas de cambio`);
  console.log(`   • ${catDefs.length} categorías`);
  console.log(`   • 5 usuarios`);
  console.log(`   • ${employeeData.length} empleados`);
  console.log(`   • ${assetDefs.length} activos`);
  console.log(`   • 13 asignaciones (8 ACTIVE, 3 RETURNED, 1 TRANSFERRED + 1 ACTIVE)`);
}

main()
  .catch((e) => { console.error('❌ Error en seed:', e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
