# Despliegue Novahold Inventory en AWS

Guía paso a paso para llevar la app dockerizada a AWS App Runner + RDS MySQL.

---

## 0. Decisión de arquitectura

| Componente | Servicio AWS | Por qué |
|---|---|---|
| Container Next.js | **AWS App Runner** | Maneja HTTPS, autoscaling, deployments — sin pelear con VPC/ALB/ECS |
| Base de datos | **Amazon RDS for MySQL** (`db.t4g.micro`) | Misma engine que tu local, costo bajo (~USD 15/mes) |
| Imagen Docker | **Amazon ECR** | Registry privado de AWS, integración nativa con App Runner |
| Secretos | **AWS Secrets Manager** | DATABASE_URL, NEXTAUTH_SECRET, Azure AD creds |
| (Futuro) Dominio | **Route 53** + **ACM** | Dominio custom + cert SSL gratis |

**Costo estimado**: ~USD 40-65/mes con tráfico bajo.

**Por qué no ECS Fargate**: requiere aprender VPC, subnets, ALB, target groups, task definitions ANTES de ver tu app corriendo. App Runner abstrae todo eso. El Dockerfile que escribimos es **el mismo** que usarías para Fargate el día que lo necesites.

---

## 1. Recursos AWS a crear (checklist)

### En la consola de AWS:
- [ ] Repositorio en **ECR** llamado `novahold-inventory`
- [ ] Instancia **RDS MySQL 8.0**, `db.t4g.micro`, almacenamiento 20 GB gp3
- [ ] **Security Group** para RDS — ingress puerto 3306 solo desde tu IP (carga manual) y desde App Runner
- [ ] Secret en **Secrets Manager** con todas las env vars
- [ ] Servicio en **App Runner** apuntando al repo ECR

### En tu máquina (prerequisitos):
- [ ] AWS CLI v2 configurado (`aws configure`)
- [ ] Docker Desktop corriendo
- [ ] Acceso SSH/HTTPS al repo Git
- [ ] Cliente MySQL (DBeaver / MySQL Workbench / TablePlus / Sequel Ace) para carga manual

---

## 2. Estado actual (lo que YA está hecho)

### ✅ Paso 1 — Next.js standalone
`next.config.ts` tiene `output: "standalone"`. Genera build mínimo para Docker (~150MB en lugar de 1GB).

### ✅ Paso 2 — Dockerfile multi-stage
- `Dockerfile` con 3 stages: `deps` → `builder` → `runner`
- `.dockerignore` con .env*, tests, .git, etc.
- Usuario no-root `nextjs:nodejs` (UID 1001)
- `HOSTNAME=0.0.0.0` para que escuche en todas las interfaces

### ✅ Paso 3 — Test local con docker-compose
- `docker-compose.yml` con servicios `db` (MySQL 8) + `app`
- `.env.docker` (NO versionado, secretos locales)
- Migraciones aplicadas con baseline (`prisma migrate resolve --applied`)
- App responde HTTP 307 (redirect a login) en `localhost:3000`

### Bugs de TS que se arreglaron de paso (deuda técnica que se descubrió al dockerizar)
1. `requireWrite()` sin return type explícito en `employees/`, `categories/`, `locations/` actions — refactor a patrón `AuthCheck` con discriminator `ok: true/false` (consistente con `assets/` y `assignments/`)
2. `importLog.errors` cast a `Prisma.InputJsonValue` para serialización JSON
3. `EmployeesTablePage` cast `as unknown as CreateEmployeeDTO`
4. `JWT` import movido de `next-auth` → `next-auth/jwt` (breaking change v4→v5)

### Deuda técnica pendiente (NO bloquea deploy)
- 9 errores TS en archivos `__tests__/` con mocks de Prisma — `next build` los ignora, pero deberían arreglarse en una PR aparte.

---

## 3. Comandos rápidos para retomar local

```bash
# Levantar todo (ya buildeado)
docker compose up -d

# Ver estado
docker compose ps

# Ver logs en vivo
docker compose logs -f app

# Reconstruir imagen tras cambios de código
docker compose build app && docker compose up -d app

# Bajar todo (mantiene volumes/datos)
docker compose down

# Bajar y BORRAR datos de MySQL local
docker compose down -v

# Migraciones contra MySQL local (DESDE TU MÁQUINA, no del container)
DATABASE_URL="mysql://novahold:novahold_pass@localhost:3306/novahold_inventory" \
  pnpm prisma migrate deploy
```

---

## 4. Paso 4 — Subir imagen a ECR

### 4.1 Crear el repositorio ECR

```bash
# Reemplazá us-east-1 con tu región preferida
aws ecr create-repository \
  --repository-name novahold-inventory \
  --region us-east-1 \
  --image-scanning-configuration scanOnPush=true
```

Anotá el output `repositoryUri` — algo como:
```
123456789012.dkr.ecr.us-east-1.amazonaws.com/novahold-inventory
```

### 4.2 Login de Docker contra ECR

```bash
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  123456789012.dkr.ecr.us-east-1.amazonaws.com
```

### 4.3 Build, tag y push

```bash
# Build para amd64 (App Runner corre en x86_64, NO arm64)
docker buildx build --platform linux/amd64 \
  -t novahold-inventory:latest \
  --load .

# Tag con la URI de ECR
docker tag novahold-inventory:latest \
  123456789012.dkr.ecr.us-east-1.amazonaws.com/novahold-inventory:latest

# Push
docker push 123456789012.dkr.ecr.us-east-1.amazonaws.com/novahold-inventory:latest
```

> ⚠️ **CRÍTICO**: Si tu Mac es Apple Silicon (M1/M2/M3/M4), Docker buildea ARM64 por defecto. App Runner espera AMD64 (x86_64). Si te olvidás `--platform linux/amd64`, el container va a fallar al arrancar con `exec format error`.

---

## 5. Paso 5 — Crear RDS MySQL

### 5.1 Desde la consola de AWS (recomendado para aprender)

**RDS → Create database → Standard create**

| Campo | Valor |
|---|---|
| Engine | MySQL 8.0.x (latest) |
| Templates | **Free tier** o Production (según tus necesidades) |
| DB instance identifier | `novahold-inventory-db` |
| Master username | `admin` |
| Master password | (anotar — va a Secrets Manager) |
| Instance class | `db.t4g.micro` |
| Storage | 20 GB gp3 |
| **Public access** | **Yes** (temporalmente, para carga manual) |
| VPC security group | Crear nuevo: `novahold-rds-sg` |
| Initial database name | `novahold_inventory` |

### 5.2 Configurar Security Group del RDS

Editar `novahold-rds-sg` → Inbound rules:

| Type | Protocol | Port | Source | Descripción |
|---|---|---|---|---|
| MYSQL/Aurora | TCP | 3306 | My IP | Acceso desde tu máquina (carga manual) |
| MYSQL/Aurora | TCP | 3306 | 0.0.0.0/0 | TEMPORAL — App Runner aún no existe |

> ⚠️ La regla `0.0.0.0/0` es **temporal**. Después de configurar App Runner, la reemplazás por el SG de App Runner.

### 5.3 Anotar el endpoint

Tras la creación (~5-10 min), anotá:
```
Endpoint: novahold-inventory-db.cXXXXXXXX.us-east-1.rds.amazonaws.com
Port: 3306
```

### 5.4 Aplicar migraciones a RDS

```bash
DATABASE_URL="mysql://admin:TU_PASSWORD@novahold-inventory-db.cXXXXXXXX.us-east-1.rds.amazonaws.com:3306/novahold_inventory" \
  pnpm prisma migrate deploy
```

Verificar:
```bash
DATABASE_URL="mysql://admin:TU_PASSWORD@novahold-inventory-db.cXXXXXXXX.us-east-1.rds.amazonaws.com:3306/novahold_inventory" \
  pnpm prisma migrate status
# Debe decir: "Database schema is up to date!"
```

---

## 6. Paso 6 — Conexión manual a RDS para cargar data

### 6.1 Cliente MySQL recomendado

| Cliente | OS | Por qué |
|---|---|---|
| **DBeaver Community** | Mac/Win/Linux | Gratis, completo, soporta CSV import |
| **TablePlus** | Mac/Win | UX excelente, free tier limitado |
| **MySQL Workbench** | Mac/Win/Linux | Oficial de Oracle, pesado pero estable |
| **Sequel Ace** | Mac | Gratis, rápido, solo Mac |

### 6.2 Conexión desde el cliente

| Campo | Valor |
|---|---|
| Host | `novahold-inventory-db.cXXXXXXXX.us-east-1.rds.amazonaws.com` |
| Port | `3306` |
| Username | `admin` |
| Password | (el que pusiste al crear RDS) |
| Database | `novahold_inventory` |
| SSL | **Required** (obligatorio en RDS por defecto) |

> Si te aparece error de SSL, descargá el cert de AWS:
> ```bash
> curl -O https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
> ```
> Y configuralo en tu cliente MySQL como CA root.

### 6.3 Workflows típicos de carga manual

**Opción A — Importar CSV vía cliente GUI**:
1. DBeaver → tabla destino → Import Data → CSV → mapear columnas → Run

**Opción B — `LOAD DATA LOCAL INFILE` (más rápido, requiere flag)**:
```sql
SET GLOBAL local_infile = 1;
LOAD DATA LOCAL INFILE '/ruta/a/empleados.csv'
INTO TABLE employees
FIELDS TERMINATED BY ','
ENCLOSED BY '"'
LINES TERMINATED BY '\n'
IGNORE 1 ROWS;
```

**Opción C — Prisma seed contra RDS** (si tenés `prisma/seed.ts`):
```bash
DATABASE_URL="mysql://admin:TU_PASSWORD@<endpoint>:3306/novahold_inventory" \
  pnpm db:seed
```

### 6.4 Despues de cargar la data

**SACÁ la regla `0.0.0.0/0` del Security Group**:
- RDS → Security groups → `novahold-rds-sg`
- Inbound rules → eliminar la regla con source `0.0.0.0/0`
- Mantener solo:
  - `My IP` (para vos)
  - El SG del App Runner (paso 7)

---

## 7. Paso 7 — Crear secret en Secrets Manager

### 7.1 Generar NEXTAUTH_SECRET nuevo (NO reuses el de local)

```bash
openssl rand -base64 32
```

### 7.2 Crear el secret

**Secrets Manager → Store a new secret → Other type of secret**

Tipo: **Plaintext** (más simple) o **Key/value**.

Pegá este JSON:
```json
{
  "DATABASE_URL": "mysql://admin:TU_PASSWORD@<endpoint>:3306/novahold_inventory",
  "NEXTAUTH_URL": "https://TU-APP.us-east-1.awsapprunner.com",
  "NEXTAUTH_SECRET": "<openssl rand -base64 32>",
  "AUTH_AZURE_AD_ID": "<azure client id>",
  "AUTH_AZURE_AD_SECRET": "<azure client secret>",
  "AUTH_AZURE_AD_TENANT_ID": "<azure tenant id>"
}
```

> `NEXTAUTH_URL` la vas a saber **después** de crear App Runner. Volvé a editar el secret entonces.

Nombre del secret: `novahold-inventory-prod`

Anotar el ARN.

---

## 8. Paso 8 — Crear servicio App Runner

### 8.1 Desde la consola

**App Runner → Create service**

**Source**:
- Source: Container registry → Amazon ECR
- Container image URI: `123456789012.dkr.ecr.us-east-1.amazonaws.com/novahold-inventory:latest`
- Deployment trigger: **Automatic** (redeploy on push) o **Manual**
- ECR access role: **Create new service role**

**Service settings**:
- Service name: `novahold-inventory`
- Virtual CPU: **1 vCPU**
- Memory: **2 GB**
- Port: **3000**
- Environment variables: (cargar desde Secrets Manager — siguiente paso)

**Auto scaling** (opcional):
- Min: 1, Max: 5
- Concurrency: 100 requests

**Health check**:
- Protocol: HTTP
- Path: `/api/health` *(si no tenés ese endpoint, dejá el default `/`)*

### 8.2 Conectar Secrets Manager

App Runner → tu servicio → Configuration → **Edit** → Environment variables

Para cada clave del secret JSON, agregar:
- Key: `DATABASE_URL`
- Source: **Secrets Manager**
- Value: ARN del secret + `:DATABASE_URL::` (la sintaxis de JSON path)

Repetir para todas las variables.

### 8.3 Anotar la URL de App Runner

Algo como `https://abc123xyz.us-east-1.awsapprunner.com`.

**Volvé al secret** y actualizá `NEXTAUTH_URL` con esta URL.

---

## 9. Paso 9 — Conectar App Runner ↔ RDS de forma segura

App Runner por defecto NO está en una VPC. Para conectarse a RDS de forma privada hay dos opciones:

**Opción A — RDS público + IP allowlist** (más simple):
- Mantener RDS público
- En el SG de RDS, **agregar las IPs de salida de App Runner** (App Runner → tu servicio → "Outbound IPs")
- Eliminar la regla `0.0.0.0/0`

**Opción B — VPC Connector** (más seguro, recomendado):
- App Runner → tu servicio → Configuration → Networking → **VPC connector**
- Crear nuevo: seleccionar la VPC default + subnets privadas + un SG nuevo `novahold-app-sg`
- En el SG de RDS, agregar regla: source = `novahold-app-sg`, port 3306
- Hacer RDS **privado** (Modify → Public access: No)

**Recomendación**: arrancar con A para verificar que todo anda, después migrar a B.

---

## 10. Paso 10 — Validación end-to-end

```bash
# Health check
curl -I https://TU-APP.us-east-1.awsapprunner.com
# Debería responder 307 (redirect a login) o 200

# Logs en tiempo real
aws apprunner list-services
aws logs tail /aws/apprunner/novahold-inventory/service --follow
```

**Checklist final**:
- [ ] App Runner status: **Running**
- [ ] Curl a la URL de App Runner responde sin 502
- [ ] Login de Azure AD funciona (si configuraste creds reales)
- [ ] Las pantallas de assets/employees cargan datos de RDS
- [ ] La carga manual de datos hecha en paso 6 aparece en la UI

---

## Troubleshooting

| Síntoma | Causa probable | Fix |
|---|---|---|
| 502 Bad Gateway | Container no escucha en `0.0.0.0` | Verificar `HOSTNAME=0.0.0.0` en Dockerfile |
| `exec format error` en App Runner | Imagen buildeada para arm64 (Mac M1+) | Rebuild con `--platform linux/amd64` |
| `Can't connect to MySQL ... timeout` | SG de RDS no permite App Runner | Agregar IPs de salida de App Runner al SG |
| `SSL connection error` | Cliente MySQL no tiene CA cert | Descargar `global-bundle.pem` de AWS |
| `Migration X has not yet been applied` | RDS recién creada sin migraciones | Correr `prisma migrate deploy` con DATABASE_URL de RDS |
| `database schema is not empty` | Schema sin tracking en `_prisma_migrations` | `prisma migrate resolve --applied <name>` |
| `Failed to type check` en `next build` | Errores TS preexistentes | Revisar `pnpm tsc --noEmit` para verlos todos |

---

## Archivos clave del proyecto

| Archivo | Propósito |
|---|---|
| `Dockerfile` | Multi-stage build (deps → builder → runner) |
| `.dockerignore` | Qué excluir del build context (.env*, tests, .git) |
| `docker-compose.yml` | Orquestación local (db + app) |
| `.env.docker` | Env vars para test local (NO versionado) |
| `next.config.ts` | `output: 'standalone'` para imagen mínima |
| `prisma.config.ts` | Schema + migrations + seed config |
| `prisma/schema.prisma` | Schema de DB |
| `prisma/migrations/` | Historial de migraciones |

---

## Próximas mejoras (no para mañana)

- [ ] Endpoint `/api/health` para health check de App Runner
- [ ] CI/CD: GitHub Actions que buildea y pushea a ECR en cada merge a `main`
- [ ] Dominio custom con Route 53 + ACM
- [ ] CloudWatch Alarms (latencia, error rate, RDS CPU)
- [ ] Backups automáticos de RDS (configurables al crear)
- [ ] Migración de RDS público → privado vía VPC Connector
- [ ] Arreglar 9 errores TS en archivos `__tests__/`
