# Guía: Aurora Serverless v2 — Setup óptimo para Novahold Inventory

> **Cuándo usar esta guía**: querés gestión profesional como RDS pero con costo proporcional al uso real. La app solo se usa en horario laboral (8h × 22 días = 176h/mes), así que escalar a 0 fuera de horas tiene sentido económico.

---

## 1. Concepto

Aurora Serverless v2 es **MySQL gestionado que escala compute en tiempo real** según la carga. Pagás por **ACU (Aurora Capacity Units)** consumidas, no por una instancia fija. Cuando nadie usa la app, escala a 0 ACU y deja de cobrar compute (storage sí sigue, pero es centavos).

**ACU = 2 GB RAM + CPU + IO proporcional**. Mínimo 0 ACU (auto-pause), máximo ajustable.

**Tradeoff principal**: pagás ~USD 13/mes (similar a RDS), pero si la app realmente solo se usa en horario laboral, podés bajar a ~USD 8–10. Si tiene tráfico continuo, sale igual o más caro que RDS.

---

## 2. Costos esperados

### Asunciones para el cálculo

- Horario laboral: L–V 8am–6pm = ~176h activas/mes
- Carga típica: 0.5 ACU promedio (10–50 users no exigen más)
- Storage: 20 GB inicial

### Desglose mensual

| Item | Costo |
|---|---:|
| ACU activas: 176h × 0.5 ACU × $0.12 | $10.56 |
| ACU idle (auto-paused): ~554h × 0 ACU | $0 |
| Storage: 20 GB × $0.10 | $2.00 |
| I/O requests (estimado conservador) | $0.50 |
| **Total mensual** | **~$13.06** |

### Comparación anual

| Período | Aurora Serverless v2 | RDS db.t4g.micro | EC2 + MySQL |
|---|---:|---:|---:|
| Año 1 (Free Tier) | **~$157** ❌ no aplica | $0 ✅ | $0 ✅ |
| Año 2+ | **$157/año** | $168/año | $93/año |

⚠️ **Aurora Serverless NO está en el Free Tier**. Si tu cuenta es nueva, RDS es ~$157 más barata el primer año.

---

## 3. Cuándo Aurora Serverless v2 conviene vs RDS

| Escenario | Mejor opción |
|---|---|
| Año 1, cuenta nueva | **RDS** (Free Tier) |
| Año 2+, app solo horario laboral | **Aurora Serverless** |
| Año 2+, app con tráfico 24/7 | **RDS** (más barata) |
| Carga muy variable (picos) | **Aurora Serverless** (escala) |
| Carga predecible | **RDS** (precio fijo) |
| Necesitás DB pequeña <10 GB | **RDS** |
| DB grande con picos esporádicos | **Aurora Serverless** |

**Para Novahold Inventory**: año 1 → RDS por Free Tier. Año 2 → reevaluar según uso real.

---

## 4. Arquitectura

```
[Vercel - red pública]  ──(internet + SSL)──>  [Aurora Serverless público en AWS]
```

Aurora vive dentro de un **DB cluster**, no de una instancia individual. El endpoint que usás en Vercel es el del **cluster**, no de un nodo.

---

## 5. Configuración óptima

| Campo | Valor recomendado | Justificación |
|---|---|---|
| Engine | Aurora MySQL-Compatible | 100% compatible con tu Prisma |
| Version | Aurora MySQL 3.07+ (MySQL 8.0) | Última estable |
| Capacity type | **Serverless v2** | El objetivo de esta guía |
| Cluster identifier | `nvh-aurora-prod` | Nombre claro |
| Min ACU | **0** | Escala a 0, no cobra cuando no hay uso |
| Max ACU | **2** | Suficiente para 50 users; subir si crece |
| Multi-AZ | ❌ NO | Dobla el costo, innecesario |
| Public access | ✅ YES | Vercel debe alcanzar |
| VPC SG | Nueva: `nvh-aurora-sg` | Aislada |
| Master username | `nvh_admin` | NO `root` ni `admin` |
| Master password | Auto-generated | Guardar AHORA |
| Initial DB name | `novahold` | Coincide con `DATABASE_URL` |
| Backup retention | 7 días | Default, gratis |
| Backup window | 06:00 UTC | = 01:00 Colombia |
| Encryption at rest | ✅ ON | Sin costo, regulatorio |
| Performance Insights | ✅ ON | Free 7 días |
| Auto minor version upgrade | ✅ ON | Patches automáticos |
| Deletion protection | ✅ ON | Que nadie la borre |

---

## 6. Paso a paso AWS Console

### Paso 1 — Verificar disponibilidad

Aurora Serverless v2 con **min capacity = 0** (auto-pause real) está disponible solo en regiones recientes. Verificá en `us-east-1` antes de empezar.

### Paso 2 — Crear database

```
AWS Console → RDS → Create database → Standard create
```

### Paso 3 — Engine

- Engine type: **Aurora (MySQL Compatible)**
- Edition: Aurora MySQL
- Engine version: la más reciente con "MySQL 8.0 compatibility"

### Paso 4 — Templates

- **Production** (no hay Free Tier para Aurora)

### Paso 5 — Settings

- DB cluster identifier: `nvh-aurora-prod`
- Master username: `nvh_admin`
- Master password: **Auto generate password**

⚠️ **Copialo cuando aparezca al final**. AWS lo muestra UNA vez.

### Paso 6 — Cluster storage configuration

- Storage type: **Aurora Standard** (no IO-Optimized — más caro)

### Paso 7 — Instance configuration ⭐ ACÁ ES SERVERLESS

- DB instance class: **Serverless v2**
- Capacity range:
  - Minimum: **0 ACUs** (escala a 0 = auto-pause real)
  - Maximum: **2 ACUs**

### Paso 8 — Availability & durability

- Multi-AZ: **Don't create an Aurora Replica**

### Paso 9 — Connectivity

- Compute resource: **Don't connect to an EC2**
- VPC: **Default**
- DB subnet group: **default**
- Public access: ✅ **Yes**
- VPC SG: **Create new** → `nvh-aurora-sg`
- Port: `3306`

### Paso 10 — Authentication

- **Password authentication**

### Paso 11 — Additional configuration (¡expandir!)

- Initial database name: `novahold`
- DB cluster parameter group: default (después creamos uno con SSL forzado)
- Backup retention: **7 days**
- Backup window: `06:00` UTC
- ✅ **Enable encryption** (default KMS key)
- ✅ **Enable Performance Insights** (7 días free)
- ✅ **Enable auto minor version upgrade**
- ✅ **Enable deletion protection**

### Paso 12 — Create

Tarda ~10–15 minutos. Aurora tarda más que RDS estándar.

---

## 7. Endurecer seguridad

### 7.1 Forzar SSL

```
RDS → Parameter groups → Create parameter group
- Family: aurora-mysql8.0
- Type: DB Cluster Parameter Group
- Name: nvh-aurora-tls
```

Editarlo:
```
require_secure_transport = ON
```

Aplicarlo al cluster:
```
RDS → tu cluster → Modify → DB cluster parameter group: nvh-aurora-tls
→ Apply immediately
```

### 7.2 Security group

```
EC2 → Security Groups → nvh-aurora-sg → Inbound rules
- Type: MySQL/Aurora (3306)
- Source: 0.0.0.0/0
- Description: "Vercel public — protected by SSL+password"
```

---

## 8. Construir la `DATABASE_URL` para Next.js

### 8.1 Anatomía de la URL

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
   │       │      │       │    │      │
   │       │      │       │    │      └─ nombre de la base de datos
   │       │      │       │    └──────── puerto MySQL (3306)
   │       │      │       └───────────── Cluster endpoint (writer)
   │       │      └───────────────────── password del master user
   │       └──────────────────────────── master username
   └──────────────────────────────────── protocolo MySQL
```

### 8.2 ⚠️ Aurora tiene 2 endpoints — usá el correcto

| Endpoint | Cuándo usar | Nombre |
|---|---|---|
| **Writer endpoint** ✅ | App Next.js (lecturas + escrituras) | `nvh-aurora-prod.cluster-XXXXX...` |
| **Reader endpoint** | Solo lecturas a réplica | `nvh-aurora-prod.cluster-ro-XXXXX...` |

Si usás el reader endpoint en `DATABASE_URL`, vas a tener errores de "read-only transaction" en cualquier escritura. **Usá siempre el writer**.

Cómo distinguirlos:

```
RDS → Databases → nvh-aurora-prod → Connectivity & security → Endpoints
```

| Type | Endpoint | Usar |
|---|---|---|
| Writer | `nvh-aurora-prod.cluster-c9a8b7.us-east-1.rds.amazonaws.com` | ✅ |
| Reader | `nvh-aurora-prod.cluster-**ro**-c9a8b7.us-east-1.rds.amazonaws.com` | ❌ |

### 8.3 De dónde sacar cada parte

| Parte | Valor | Dónde encontrarlo |
|---|---|---|
| `USER` | `nvh_admin` | El del paso 5 |
| `PASSWORD` | el generado por AWS | El del paso 5 |
| `HOST` | `nvh-aurora-prod.cluster-XXXXX.us-east-1.rds.amazonaws.com` | RDS → cluster → **Writer endpoint** |
| `PORT` | `3306` | Default Aurora MySQL |
| `DATABASE` | `novahold` | El "Initial database name" del paso 11 |

### 8.4 ⚠️ URL-encodear el password (IMPORTANTÍSIMO)

Si el password generado por AWS tiene caracteres especiales (lo más común), **TENÉS QUE URL-encodearlos**.

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
mysql://nvh_admin:xK9!mPQ%402%23aB%26z@nvh-aurora-prod.cluster-c9a8b7.us-east-1.rds.amazonaws.com:3306/novahold
```

**Tip rápido en Node.js**:
```javascript
encodeURIComponent('xK9!mPQ@2#aB&z')
// → 'xK9!mPQ%402%23aB%26z'
```

### 8.5 Adaptar `prisma.ts` para SSL

Tu app usa `@prisma/adapter-mariadb`. **El adapter actual en `src/lib/prisma.ts` NO lee SSL desde la URL** — pasalo explícitamente al adapter.

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

Aurora usa certs firmados por AWS — `rejectUnauthorized: true` funciona out of the box (a diferencia de EC2 con cert auto-firmado).

### 8.6 ⚠️ Pool de conexiones — crítico para que escale a 0

Aurora Serverless v2 con `min ACU = 0` solo escala a 0 si **no hay conexiones activas**. Si tu app mantiene conexiones persistentes "por las dudas", Aurora nunca se duerme y pagás 24/7.

Opciones:

#### A) Connection pool con timeout corto (recomendado)

En tu URL, agregá un parámetro custom (`@prisma/adapter-mariadb` lo respeta a nivel del adapter):

```typescript
return new PrismaMariaDb({
  // ... otros campos
  connectionLimit: 5,
  idleTimeout: 60000, // 60s — desconecta si está idle
});
```

#### B) Verificar comportamiento

```
RDS → cluster → Monitoring → ServerlessDatabaseCapacity
```

Después de 15 min sin actividad, debería bajar a 0. Si se queda en 0.5+, hay conexiones colgadas.

### 8.7 Configurar la URL en cada entorno

#### A) Desarrollo local (`.env.local`)

```bash
DATABASE_URL="mysql://root:root@localhost:3306/novahold"
```

> `.env.local` está en `.gitignore`. NUNCA pongas el password de prod ahí.

#### B) Producción Vercel

```
Vercel → tu proyecto → Settings → Environment Variables → Add New
```

| Campo | Valor |
|---|---|
| Key | `DATABASE_URL` |
| Value | `mysql://nvh_admin:PASSWORD-ENCODED@nvh-aurora-prod.cluster-XXXXX.us-east-1.rds.amazonaws.com:3306/novahold` |
| Environments | ✅ Production |

#### C) Aplicar el cambio

```
Vercel → Deployments → último deploy → ⋯ → Redeploy
```

### 8.8 Verificar que funciona

En logs de Vercel:

✅ **Bien**:
```
Database connected
GET / 200 in 234ms
```

⚠️ **Cold start esperado** (primer request del día):
```
GET / 200 in 8453ms   ← 5–10s extra mientras Aurora despierta
GET /assets 200 in 187ms ← ya está caliente
```

❌ **Mal**:
| Error | Causa |
|---|---|
| `connect ECONNREFUSED` | URL malformada o cluster no Available |
| `Access denied for user` | Password sin encodear o wrong endpoint |
| `Operation not allowed: read-only` | Usaste el READER endpoint en vez del WRITER |
| `Connections using insecure transport are prohibited` | Falta `ssl: { rejectUnauthorized: true }` en el adapter |

### 8.9 Cheatsheet final

```bash
# Local (.env.local)
DATABASE_URL="mysql://root:root@localhost:3306/novahold"

# Producción Vercel (Writer endpoint, password URL-encoded)
DATABASE_URL="mysql://nvh_admin:xK9%21mPQ%402aB@nvh-aurora-prod.cluster-c9a8b7.us-east-1.rds.amazonaws.com:3306/novahold"
```

---

## 9. Migrar el schema

```bash
DATABASE_URL="mysql://nvh_admin:PASSWORD@nvh-aurora-prod.cluster-XXXXX.us-east-1.rds.amazonaws.com:3306/novahold?ssl={\"rejectUnauthorized\":true}" \
  npx prisma migrate deploy
```

---

## 10. Alertas de presupuesto

### Budget general

```
AWS Billing → Budgets → Create budget
- Type: Cost budget – Recommended
- Name: nvh-monthly-cap
- Period: Monthly
- Amount: USD 20
- Alerts: 50%, 80%, 100%
```

### Budget específico Aurora

```
- Name: nvh-aurora-only
- Filter by service: RDS (Aurora cuenta como RDS en billing)
- Amount: USD 18
- Alert: 100%
```

### Alarma de ACU sostenido (CRÍTICO)

⚠️ Si Aurora sostiene 2 ACUs por horas seguidas, te dispara la factura. Configurá alarma:

```
CloudWatch → Alarms → Create alarm
- Metric: RDS / ServerlessDatabaseCapacity
- Stat: Average
- Threshold: > 1.5 ACU por 30 min
- Action: SNS topic → email
```

---

## 11. Cold start — qué esperar

Cuando min ACU = 0 y nadie usó la DB por minutos, la primera conexión paga **cold start**:

| Tiempo idle | Cold start estimado |
|---|---|
| <5 min | 0 (cache caliente) |
| 5–15 min | 1–3 segundos |
| >15 min | 5–15 segundos |

**Impacto en Novahold**: el primer login del día (8am) puede tardar 5–10s extra. Aceptable para uso interno, problemático para SaaS público.

**Cómo mitigarlo**: subir `Min ACU` a `0.5` (cuesta ~$3/mes extra) y mantener la DB siempre tibia.

---

## 12. Verificar que escala correctamente

```
RDS → tu cluster → Monitoring → CloudWatch metrics
- Buscar: ServerlessDatabaseCapacity
- Ver gráfico: debería bajar a 0 cuando nadie usa la app
- Ver pico: cuando hay tráfico debería subir a 0.5–1 ACU
```

Si el ACU se mantiene en 1+ siempre, hay algo mal:
- Una conexión persistente sin cerrar
- Algún cron interno corriendo
- Health check muy agresivo

---

## 13. Checklist final

- [ ] Cluster status = `Available`
- [ ] Writer endpoint copiado y pegado en Vercel
- [ ] Vercel redeployó después del cambio
- [ ] Cluster parameter group `nvh-aurora-tls` aplicado
- [ ] Security group permite 3306 desde 0.0.0.0/0
- [ ] `npx prisma migrate deploy` corrió sin error
- [ ] App carga el login en producción
- [ ] Métrica `ServerlessDatabaseCapacity` baja a 0 cuando no hay uso
- [ ] Budget alert + ACU alarm configurados
- [ ] Password guardado en lugar seguro
- [ ] Deletion protection ON

---

## 14. Errores comunes a evitar

| Error | Consecuencia |
|---|---|
| Min ACU = 0.5 sin necesitar warm | Pagás ~$3/mes innecesarios |
| Max ACU = 8+ "por las dudas" | Si algo se descontrola, factura disparada |
| Conexión persistente sin pool | Aurora no escala a 0 nunca |
| Usar **reader** endpoint para escrituras | Errores de "read only" |
| Aurora I/O-Optimized storage | $0.225/GB en vez de $0.10 — solo si necesitás IOPS extremos |
| Olvidar la alarma de ACU | Te enterás de la factura un mes después |

---

## 15. Cuándo migrar de Aurora a otra cosa

| Situación | Migrar a |
|---|---|
| El uso pasó a 24/7 continuo | RDS db.t4g.micro (más barato fijo) |
| Necesitás más de 16 ACUs | Aurora Provisioned (instance-based) |
| Cold start es un problema crítico | RDS (no tiene cold start) |
| El costo Aurora supera $30/mes | Auditar carga; algo está mal |

---

## 16. Compatibilidad con Prisma

✅ Aurora MySQL es 100% compatible con el adapter `@prisma/adapter-mariadb` que usás en `src/lib/prisma.ts`. No hay cambios de código — solo cambia la `DATABASE_URL`.

---

**Resumen**: Aurora Serverless v2 con `min ACU = 0` es **excelente para apps de uso laboral** como Novahold. Pagás solo por las horas activas (~$13/mes año 2 vs $168/año fijos en RDS). Pero **no aplica Free Tier**, así que el primer año RDS sigue siendo gratis y mejor. La estrategia óptima: **año 1 → RDS Free Tier · año 2 → evaluar migrar a Aurora si la app sigue siendo solo horario laboral**.
