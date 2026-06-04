# Guía: RDS MySQL gestionado — Setup óptimo para Novahold Inventory

> **Cuándo usar esta guía**: querés la opción más simple, segura y predecible. AWS administra backups, parches, monitoreo y failover. Es la **recomendada** para producción de un ERP interno.

---

## 1. Concepto

RDS es **MySQL gestionado**. AWS te entrega la base de datos lista, con backups automáticos, parches de seguridad, monitoreo y restore point-in-time. A diferencia de instalar MySQL en una EC2, vos NO sos el DBA — solo te conectás y consultás.

**Tradeoff principal**: pagás ~USD 14/mes (gratis primer año con Free Tier) a cambio de cero horas de mantenimiento.

---

## 2. Costos esperados

| Período | Costo | Notas |
|---|---:|---|
| Año 1 (Free Tier) | ~$0 | 750h/mes + 20 GB gratis |
| Año 2 conservador | $168/año | DB se mantiene en ~20 GB |
| Año 2 realista | $180–200/año | DB crece a 30–40 GB |
| Año 2 con storage 100 GB | ~$280/año | Solo si la DB crece mucho |

**Desglose mensual base**:
- Instancia `db.t4g.micro` 24/7 → $11.68
- Storage gp3 20 GB → $2.30
- Backups (hasta el tamaño de la DB) → gratis
- **Total → ~$13.98/mes**

---

## 3. Arquitectura

```
[Vercel - red pública]  ──(internet + SSL)──>  [RDS público en AWS]
```

Como la app vive en Vercel y la DB en AWS, RDS debe ser **público**. Compensamos con SSL obligatorio + password fuerte + Vercel-only IPs si fuera posible (no lo es porque Vercel no tiene IPs fijas).

---

## 4. Configuración óptima

| Campo | Valor recomendado | Justificación |
|---|---|---|
| Engine | MySQL 8.0.x (último minor) | Coincide con Prisma schema |
| Template | Free Tier (cuenta nueva) o Production | Free Tier primer año |
| Instance class | `db.t4g.micro` | Suficiente para 10–50 users |
| Storage type | gp3 | Más barato que gp2 |
| Storage inicial | 20 GB | Sobra para el inicio |
| Storage autoscaling | ✅ ON, máx 100 GB | Evita "disk full" a las 2am |
| Multi-AZ | ❌ NO | Dobla el costo, innecesario |
| Public access | ✅ YES | Vercel debe alcanzar la DB |
| VPC SG | Nueva: `nvh-rds-sg` | Aislada y nombrada |
| Master username | `nvh_admin` | NO `root` ni `admin` |
| Master password | Auto-generated 32 chars | Guardar AHORA en lugar seguro |
| Initial DB name | `novahold` | Coincide con `DATABASE_URL` |
| Backup retention | 7 días | Default, gratis |
| Backup window | 06:00–07:00 UTC | = 01:00 Colombia, sin tráfico |
| Maintenance window | Domingo 07:00 UTC | Domingo madrugada |
| Encryption at rest | ✅ ON | Sin costo, regulatorio |
| Performance Insights | ✅ ON, 7 días | Free, diagnostica queries lentas |
| Enhanced Monitoring | ❌ OFF | $1.40/mes, prendelo si hay problemas |
| Auto minor version upgrade | ✅ ON | Patches automáticos |
| Deletion protection | ✅ ON | No se borra por accidente |

---

## 5. Paso a paso AWS Console

### Paso 1 — Entrar a RDS

```
AWS Console → buscar "RDS" → Create database
```

### Paso 2 — Método de creación

Seleccionar **Standard create** (NO Easy create — necesitamos control fino).

### Paso 3 — Engine

- Engine type: **MySQL**
- Edition: **MySQL Community**
- Version: la más reciente 8.0.x

### Paso 4 — Templates

- Cuenta nueva (<12 meses) → **Free tier**
- Cuenta vieja → **Production** (después bajamos Multi-AZ)

### Paso 5 — Settings

- DB instance identifier: `nvh-inventory-prod`
- Master username: `nvh_admin`
- Master password: **Auto generate password**

⚠️ **CRÍTICO**: cuando termines la creación, AWS muestra el password UNA SOLA VEZ. Copialo a un archivo seguro al instante. Si lo perdés, hay que resetearlo.

### Paso 6 — Instance configuration

- Burstable classes → **db.t4g.micro**

### Paso 7 — Storage

- Type: **gp3**
- Allocated: **20 GB**
- ✅ **Enable storage autoscaling**
- Max threshold: **100 GB**

### Paso 8 — Connectivity (acá la gente la emboca)

- Compute resource: **Don't connect to an EC2 compute resource**
- VPC: **Default VPC**
- DB subnet group: **default**
- Public access: ✅ **Yes** ← crítico para Vercel
- VPC security group: **Create new** → nombre: `nvh-rds-sg`
- AZ: **No preference**
- Port: `3306`

### Paso 9 — Authentication

- **Password authentication**

### Paso 10 — Additional configuration (¡expandir!)

- Initial database name: `novahold`
- Backup retention: **7 days**
- Backup window: **Select** → start `06:00` UTC, duración 1h
- ✅ **Enable encryption** (default KMS key)
- ✅ **Enable Performance Insights** (7 días, free)
- ✅ **Enable auto minor version upgrade**
- Maintenance window: **Select** → Sunday 07:00 UTC, duración 1h
- ✅ **Enable deletion protection**

### Paso 11 — Create

Tarda ~10 minutos.

---

## 6. Endurecer seguridad post-creación

### 6.1 Forzar SSL en todas las conexiones

Crear parameter group:

```
RDS → Parameter groups → Create parameter group
- Family: mysql8.0
- Name: nvh-mysql8-tls
- Type: DB Parameter Group
```

Editarlo y agregar:
```
require_secure_transport = ON
```

Aplicarlo a la instancia:
```
RDS → tu DB → Modify → DB parameter group: nvh-mysql8-tls
→ Apply immediately → Continue
```

### 6.2 Verificar el security group

```
EC2 → Security Groups → nvh-rds-sg → Inbound rules
- Type: MySQL/Aurora (3306)
- Source: 0.0.0.0/0
- Description: "Vercel public — protected by SSL+password"
```

> Sí, el `0.0.0.0/0` se ve feo. Es necesario porque Vercel no publica IPs estables. La protección real es el password fuerte + SSL obligatorio.

---

## 7. Construir la `DATABASE_URL` para Next.js

### 7.1 Anatomía de la URL

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
   │       │      │       │    │      │
   │       │      │       │    │      └─ nombre de la base de datos
   │       │      │       │    └──────── puerto MySQL (3306)
   │       │      │       └───────────── endpoint de RDS
   │       │      └───────────────────── password del master user
   │       └──────────────────────────── master username
   └──────────────────────────────────── protocolo MySQL
```

### 7.2 De dónde sacar cada parte

| Parte | Valor | Dónde encontrarlo |
|---|---|---|
| `USER` | `nvh_admin` | El que pusiste en el paso 5 |
| `PASSWORD` | `xK9!mPQ2...` | El generado por AWS, paso 5 |
| `HOST` | `nvh-inventory-prod.cXXXXX.us-east-1.rds.amazonaws.com` | RDS → tu DB → **Connectivity & security → Endpoint** |
| `PORT` | `3306` | Default MySQL |
| `DATABASE` | `novahold` | El "Initial database name" del paso 10 |

### 7.3 ⚠️ URL-encodear el password (IMPORTANTÍSIMO)

Si el password generado por AWS tiene caracteres especiales (lo más común), **TENÉS QUE URL-encodearlos** o la URL se rompe.

Tabla de equivalencias críticas:

| Carácter | URL-encoded |
|---|---|
| `@` | `%40` |
| `:` | `%3A` |
| `/` | `%2F` |
| `?` | `%3F` |
| `#` | `%23` |
| `&` | `%26` |
| `+` | `%2B` |
| ` ` (espacio) | `%20` |
| `%` | `%25` |

**Ejemplo concreto**:

Password original: `xK9!mPQ@2#aB&z`
URL-encoded: `xK9!mPQ%402%23aB%26z`

URL final:
```
mysql://nvh_admin:xK9!mPQ%402%23aB%26z@nvh-inventory-prod.cXXXXX.us-east-1.rds.amazonaws.com:3306/novahold
```

**Tip rápido**: en Node.js corré esto en la consola para encodear:
```javascript
encodeURIComponent('xK9!mPQ@2#aB&z')
// → 'xK9!mPQ%402%23aB%26z'
```

### 7.4 Agregar SSL (obligatorio en producción)

Tu app usa `@prisma/adapter-mariadb`. **El adapter actual en `src/lib/prisma.ts` NO lee SSL desde la URL** — tenés que pasarlo explícitamente al adapter.

Editá `src/lib/prisma.ts`:

```typescript
import { PrismaClient } from '@/generated/prisma/client';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';

function createAdapter() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/novahold');
  const isProd = process.env.NODE_ENV === 'production';

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password), // 👈 desencodea automáticamente
    database: url.pathname.slice(1),
    ssl: isProd ? { rejectUnauthorized: true } : undefined, // 👈 SSL solo en prod
  });
}

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient | undefined };

export const prisma: PrismaClient =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: createAdapter(),
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

Dos cambios clave:
1. `decodeURIComponent(url.password)` → desarma el URL-encoding antes de pasarlo a MySQL
2. `ssl: isProd ? {...} : undefined` → SSL en prod, plano en dev (localhost no tiene cert)

### 7.5 Configurar la URL en cada entorno

#### A) Desarrollo local (`.env.local`)

Crear/editar `.env.local` en la raíz del proyecto:

```bash
DATABASE_URL="mysql://root:root@localhost:3306/novahold"
```

> `.env.local` está en `.gitignore` por default en Next.js — perfecto para secretos. NUNCA pongas el password de prod ahí.

#### B) Producción Vercel

```
Vercel → tu proyecto → Settings → Environment Variables → Add New
```

| Campo | Valor |
|---|---|
| Key | `DATABASE_URL` |
| Value | `mysql://nvh_admin:PASSWORD-ENCODED@TU-ENDPOINT:3306/novahold` |
| Environments | ✅ Production |
| | ⬜ Preview |
| | ⬜ Development |

⚠️ **NO la pongas en Preview** — los preview deploys te quemarían cuota de prod o pisarían datos.

#### C) Aplicar el cambio

Cambiar env vars en Vercel **NO redeploya automáticamente**. Tenés que:

```
Vercel → Deployments → último deploy → ⋯ → Redeploy
```

O hacer un push trivial a `main` para disparar nuevo build.

### 7.6 Verificar que funciona

En los logs de Vercel después del redeploy:

✅ **Bien**:
```
Database connected
GET / 200 in 234ms
```

❌ **Mal** (URL malformada):
```
Error: connect ECONNREFUSED ::1:3306
```
→ Variable no llegó a producción o tiene typo

❌ **Mal** (password con char especial sin encodear):
```
Error: Access denied for user
```
→ Falta URL-encoding en el password

❌ **Mal** (sin SSL):
```
Error: Connections using insecure transport are prohibited while --require_secure_transport=ON
```
→ El parameter group ya forzó SSL, falta actualizar el adapter

### 7.7 Cheatsheet final

```bash
# Local (.env.local)
DATABASE_URL="mysql://root:root@localhost:3306/novahold"

# Producción Vercel (Environment Variables → Production)
DATABASE_URL="mysql://nvh_admin:xK9%21mPQ%402aB@nvh-inventory-prod.cXXXXX.us-east-1.rds.amazonaws.com:3306/novahold"
```

---

## 8. Migrar el schema

Desde tu máquina, con la URL apuntando al RDS:

```bash
# Generar el cliente
npx prisma generate

# Aplicar migrations al RDS
DATABASE_URL="mysql://nvh_admin:PASSWORD@TU-ENDPOINT.rds.amazonaws.com:3306/novahold?ssl={\"rejectUnauthorized\":true}" \
  npx prisma migrate deploy
```

⚠️ **NO uses `db push` en producción**. Solo `migrate deploy` con migrations versionadas.

---

## 9. Alertas de presupuesto

### 9.1 Budget general

```
AWS Billing → Budgets → Create budget
- Type: Cost budget – Recommended
- Name: nvh-monthly-cap
- Period: Monthly
- Amount: USD 20
- Alerts: 50%, 80%, 100%
- Email: tu mail
```

### 9.2 Budget específico RDS

```
- Name: nvh-rds-only
- Filter by service: RDS
- Amount: USD 18
- Alert: 100%
```

---

## 10. Verificar que funciona

```sql
-- Desde MySQL Workbench / DBeaver / línea de comandos
mysql -h TU-ENDPOINT.rds.amazonaws.com -u nvh_admin -p --ssl-mode=REQUIRED novahold

-- Probar SSL
SHOW STATUS LIKE 'Ssl_cipher';
-- Debería mostrar un cipher (ej: ECDHE-RSA-AES256-GCM-SHA384). Si está vacío, SSL no se aplicó.
```

---

## 11. Checklist final

- [ ] DB instance status = `Available`
- [ ] Endpoint copiado y pegado en Vercel `DATABASE_URL`
- [ ] Vercel redeployó después del cambio
- [ ] Parameter group `nvh-mysql8-tls` aplicado con `require_secure_transport=ON`
- [ ] Security group `nvh-rds-sg` configurado con 3306 desde 0.0.0.0/0
- [ ] `npx prisma migrate deploy` corrió sin error
- [ ] App carga el login en producción
- [ ] Budget alert llegó al email de prueba
- [ ] Password guardado en lugar seguro (NO en git, NO en Notion público)
- [ ] Deletion protection ON

---

## 12. Errores comunes a evitar

| Error | Consecuencia |
|---|---|
| Olvidar copiar el password | Reset obligatorio + re-config |
| No activar deletion protection | Borrado accidental |
| Snapshots manuales sin borrar | Acumulan $0.095/GB-mes para siempre |
| Multi-AZ "por las dudas" | Duplica factura sin necesidad real |
| Sin SSL forzado | Conexión en texto plano por internet |
| Password en git "temporalmente" | Git history queda contaminado, hay que rotar |
| Public access OFF con app en Vercel | App no puede conectar |

---

## 13. Costos extra a vigilar

| Concepto | Cuánto cobra | Cómo evitar |
|---|---:|---|
| Storage que crece | $0.115/GB-mes | Storage autoscaling con techo 100 GB |
| Backups > 7 días | $0.095/GB-mes | Mantener retention en 7 días |
| Snapshots manuales viejos | $0.095/GB-mes | Borrarlos cuando ya no sirvan |
| Performance Insights extendido | $7/mes | Mantener en 7 días (free) |
| Enhanced Monitoring | $1.40/mes | Solo prender si hay problemas reales |
| Multi-AZ | × 2 instancia | NO activar a menos que sea necesario |

---

**Resumen**: con esta config tenés una DB profesional, segura, con backups, monitoreo y patches automáticos por **~$14/mes** (gratis primer año). Para Novahold Inventory con 10–50 users es ampliamente suficiente y te deja enfocarte en construir features, no en ser DBA.
