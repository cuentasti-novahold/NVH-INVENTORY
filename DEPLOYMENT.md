# Deployment — NVH-INVENTORY

Plan de despliegue para producción sobre **AWS App Runner + RDS MySQL**. Cumple la restricción de infraestructura corporativa: base de datos MySQL obligatoriamente en AWS.

> Este documento describe la arquitectura objetivo y los pasos a ejecutar. **Los cambios en el código y la infraestructura todavía no se aplicaron** — se ejecutarán en una fase posterior del proyecto.

---

## Arquitectura

```
┌──────────┐     ┌────────────────┐     ┌───────────────────┐
│ Usuarios │────▶│   CloudFront   │────▶│   App Runner      │
└──────────┘     │   + WAF opt.   │     │   (Next.js 16)    │
                 └────────────────┘     │   Docker container│
                                        └─────────┬─────────┘
                                                  │ VPC Connector
                                                  ▼
                    ┌────────────────┐     ┌──────────────────┐
                    │  S3 (assets,   │     │  RDS MySQL 8     │
                    │  QR, backups)  │     │  db.t4g.small    │
                    └────────────────┘     │  Private subnet  │
                                           └──────────────────┘
                             │
                             ▼
                    ┌────────────────┐
                    │ Secrets Mgr    │
                    │ (DB, Azure AD, │
                    │  AUTH_SECRET)  │
                    └────────────────┘
```

**Por qué App Runner y no ECS Fargate en la primera fase**: App Runner elimina la fricción operativa de armar VPC/subnets/ALB/task definitions. Corre contenedores persistentes (no serverless por request), por lo que el connection pool de Prisma funciona sin necesidad de RDS Proxy al inicio. La misma imagen Docker se puede migrar a ECS Fargate más adelante sin reescribir código si se necesita control fino (WAF, canary deploys, múltiples servicios).

---

## Recursos AWS a Crear

| Recurso | Configuración | Costo aprox USD/mes |
|---|---|---|
| **VPC** | 1 VPC, 2 subnets privadas (AZ-a/b), 2 públicas | 0 |
| **RDS MySQL 8** | `db.t4g.small`, 20GB gp3, Single-AZ dev / Multi-AZ prod, private subnet | 25–100 |
| **RDS Parameter Group** | `character_set_server=utf8mb4`, `collation_server=utf8mb4_unicode_ci` | 0 |
| **App Runner Service** | 1 vCPU / 2GB RAM, min 1 / max 5 instancias, puerto 3000 | 25–60 |
| **App Runner VPC Connector** | Conecta App Runner → subnets privadas RDS | 0 |
| **ECR Repository** | `novahold/inventory`, lifecycle: retener últimas 10 imágenes | 1–3 |
| **S3 Bucket** | `novahold-inventory-assets`, versioning ON, SSE-S3, CORS | 3–15 |
| **CloudFront** | Distribución frente a App Runner + S3 (OAC), HTTPS, HTTP/2 | 5–20 |
| **ACM Certificate** | TLS para dominio custom (us-east-1 para CloudFront) | 0 |
| **Route 53** | Hosted zone + ALIAS records a CloudFront | 1 |
| **Secrets Manager** | 1 secreto JSON con todas las env vars sensibles | 2–5 |
| **IAM Roles** | `AppRunnerInstanceRole` (S3 + Secrets), `AppRunnerECRAccessRole` | 0 |
| **CloudWatch Logs** | Retención 30 días | 3–10 |
| **Security Groups** | SG-AppRunner (egress 3306), SG-RDS (ingress 3306 desde SG-AppRunner) | 0 |
| **TOTAL estimado** | | **~65–215** |

---

## Archivos a Crear / Modificar en el Repo

### Nuevos

- **`Dockerfile`** — Multi-stage:
  - Stage `deps`: `node:20-alpine` + `pnpm install --frozen-lockfile`
  - Stage `builder`: `pnpm prisma generate` + `pnpm build` (requiere `output: 'standalone'` en `next.config.ts`)
  - Stage `runner`: usuario no-root, copia `.next/standalone/`, `.next/static/`, `public/`, `src/generated/prisma/`, `prisma/` (para migrate deploy en entrypoint)
  - Respeta `.npmrc` `approve-builds=@prisma/engines,prisma,@prisma/client`
  - Puerto 3000, `CMD ["node", "server.js"]`

- **`.dockerignore`** — `node_modules`, `.next`, `.git`, `.env*`, `coverage`, `playwright-report`, `test-results`, `docker-compose.yml`

- **`docker-entrypoint.sh`** — Corre `pnpm prisma migrate deploy` antes de arrancar el server, para que las migraciones se apliquen en cada deploy. Si fallan, el container falla el health check y App Runner no corta tráfico.

- **`apprunner.yaml`** — Runtime docker, port 3000, env vars referenciando Secrets Manager ARNs.

- **`.github/workflows/deploy.yml`** — Pipeline:
  1. `lint-test`: `pnpm lint` + `pnpm test:unit`
  2. `build-push`: OIDC → AWS, `docker build`, push a ECR con tag `sha-${{github.sha}}` y `latest`
  3. `deploy`: `aws apprunner start-deployment --service-arn $APP_RUNNER_ARN`

- **`infra/README.md`** — Comandos AWS CLI paso a paso para recrear la infra (o migrar a Terraform/CDK si se prefiere IaC).

### Modificar

- **`next.config.ts`** → agregar `output: 'standalone'` (sin esto el runner stage del Dockerfile no funciona) y `images.remotePatterns` con dominio S3/CloudFront.
- **`src/lib/prisma.ts`** → confirmar adapter MariaDB + URL con `?connection_limit=10&pool_timeout=20`.
- **`package.json`** → agregar scripts `start:prod` (`node .next/standalone/server.js`) y `db:migrate:deploy`.
- **`docker-compose.yml`** → agregar servicio `app` opcional que builda el Dockerfile (útil para probar imagen local antes de pushear a ECR).

---

## Variables de Entorno — Secrets Manager `novahold/inventory/env`

```json
{
  "DATABASE_URL": "mysql://novahold:<pass>@<rds-endpoint>:3306/novahold_inventory?connection_limit=10&pool_timeout=20",
  "AUTH_SECRET": "<openssl rand -base64 32>",
  "AUTH_URL": "https://inventario.novahold.com",
  "AZURE_AD_CLIENT_ID": "<from Azure Portal>",
  "AZURE_AD_CLIENT_SECRET": "<from Azure Portal>",
  "AZURE_AD_TENANT_ID": "<from Azure Portal>",
  "NEXT_PUBLIC_APP_URL": "https://inventario.novahold.com",
  "AWS_S3_BUCKET": "novahold-inventory-assets",
  "AWS_S3_REGION": "us-east-1"
}
```

**Azure AD callback URL a registrar**: `https://inventario.novahold.com/api/auth/callback/azure-ad`

---

## Pasos de Ejecución (en orden)

### Fase 1 — Preparar código (1–2 hs)

1. Modificar `next.config.ts` (agregar `output: 'standalone'`).
2. Crear `Dockerfile`, `.dockerignore`, `docker-entrypoint.sh`.
3. Build local: `docker build -t nvh-test .` y `docker run -p 3000:3000 --env-file .env.local nvh-test`.
4. Commit + push.

### Fase 2 — AWS base (2–3 hs)

1. Crear VPC + subnets públicas/privadas + NAT Gateway (o mejor: **VPC Endpoints** para S3 y Secrets Manager, ahorra ~$35/mes de NAT).
2. Crear Security Groups: `SG-AppRunner` (egress 3306), `SG-RDS` (ingress 3306 desde `SG-AppRunner`).
3. Crear RDS MySQL 8 en subnets privadas con parameter group `utf8mb4`.
4. Crear S3 bucket con CORS, versioning y encryption SSE-S3.
5. Crear secreto en Secrets Manager con todas las env vars.
6. Crear IAM Roles para App Runner (`AppRunnerInstanceRole`, `AppRunnerECRAccessRole`).

### Fase 3 — Primer deploy manual (1–2 hs)

1. Crear ECR repo, primer `docker push` manual.
2. Conectarse a RDS desde bastion EC2 o Cloud9, correr `pnpm prisma migrate deploy` + `pnpm prisma db seed`.
3. Crear App Runner service apuntando a ECR, con VPC connector, env vars desde Secrets Manager, IAM role.
4. Verificar arranque en CloudWatch Logs.

### Fase 4 — Dominio y CDN (1 hs)

1. Registrar/transferir dominio a Route 53 (o mantener en registrar actual con NS delegados).
2. Solicitar ACM cert **en us-east-1** (CloudFront lo requiere en esa región).
3. Crear CloudFront distribution: origin App Runner (default behavior) + origin S3 (behavior `/assets/*`, Origin Access Control).
4. Apuntar Route 53 ALIAS → CloudFront.
5. Registrar callback URL definitiva en Azure AD App Registration.

### Fase 5 — CI/CD (1–2 hs)

1. Configurar OIDC provider en AWS para GitHub Actions (sin claves de acceso long-lived).
2. Crear IAM role asumible por el repo (trust policy con `repo:alberto8812/NVH-INVENTORY`).
3. Agregar `.github/workflows/deploy.yml`.
4. Probar: push a `main` → imagen nueva en ECR → App Runner deploy automático en ~5 min.

### Fase 6 — Hardening (opcional, 2 hs)

1. CloudWatch alarms: CPU >70%, memoria >80%, RDS connections >60%, App Runner 5xx rate.
2. AWS Backup para RDS (daily snapshots, 7 días retención).
3. WAF en CloudFront (reglas AWS managed + rate limiting).
4. Evaluar **RDS Proxy** si se ven errores de connection pool bajo carga real.

---

## Riesgos y Mitigaciones

| Riesgo | Mitigación |
|---|---|
| Connection pool exhausted en RDS | `connection_limit=10` por instancia App Runner. Con 5 instancias = 50 conexiones. Si satura → RDS Proxy (~$15/mes). |
| NAT Gateway costoso (~$35/mes) | Usar **VPC Endpoints** (Gateway S3, Interface Secrets Manager). |
| Migración Prisma rompe el deploy | `prisma migrate deploy` en el `docker-entrypoint.sh` ANTES de arrancar el server. Si falla → health check falla → App Runner no corta tráfico. |
| Excel import >120s (límite App Runner) | Chunking en frontend o SQS + Lambda worker (Fase 6, cuando aparezca el problema real). |
| Azure AD callback URL desalineado | Registrar en Azure AD tanto la prod (`inventario.novahold.com`) como `http://localhost:3000` para dev. |
| Secreto expuesto en logs | No loggear `process.env` directo. `AUTH_SECRET` solo en memoria. |

---

## Verificación End-to-End

Una vez deployado, validar:

1. Login Azure AD con `@novahold.com` → dashboard. Otros dominios rechazados.
2. Crear asset → `assetCode` `NVH-{PREFIX}-XXXXX` generado, sin gaps (transacción atómica).
3. Asset con accesorios → árbol parent-child renderiza.
4. Upload de imagen → archivo en S3, URL firmada servida desde CloudFront.
5. Escanear QR → redirige a `/assets/<assetCode>` en el dominio correcto.
6. Import Excel 500 filas → preview de validación → bulk insert termina sin timeout.
7. Asignar asset a empleado → Assignment creada + AuditLog registrado.
8. Asset con USD → `purchasePriceBase` almacenado en COP.
9. Tabla de depreciación en detalle de asset → dinámica, matches fórmula.
10. VIEWER no puede crear/editar → 403. TECHNICIAN no puede eliminar → 403.
11. CI/CD: merge PR a `main` → deploy visible en App Runner en <10 min.
12. Backup RDS: snapshot automático diario visible en consola las primeras 24 hs.

---

## Estado Actual

- [ ] Fase 1 — Preparar código
- [ ] Fase 2 — AWS base
- [ ] Fase 3 — Primer deploy manual
- [ ] Fase 4 — Dominio y CDN
- [ ] Fase 5 — CI/CD
- [ ] Fase 6 — Hardening (opcional)

Ninguna fase iniciada. Próximo paso: coordinar fecha de ejecución y responsable de crear recursos AWS con permisos de IAM adecuados.
