# Guía: EC2 + MySQL self-managed — Setup óptimo para Novahold Inventory

> **Cuándo usar esta guía**: solo si la empresa exige reducir costos al máximo y tenés (o vas a tener) tiempo dedicado a hacer de DBA. **NO es la opción recomendada** para producción crítica — perdés backups automáticos, parches automáticos y failover. Si los datos se pierden, los perdés vos.

---

## 1. Concepto

EC2 es **una máquina virtual Linux**. Vos instalás MySQL adentro, lo configurás, lo asegurás, lo backupeás, lo monitoreás y lo parcheás. AWS solo te alquila el hardware. Es la opción más barata en factura pero la más cara en tiempo y riesgo.

**Tradeoff principal**: ahorrás ~USD 6/mes vs RDS, pero asumís toda la responsabilidad operativa.

---

## 2. Costos esperados

| Período | Costo factura AWS | Tu tiempo (USD 10/h) | TCO real |
|---|---:|---:|---:|
| Año 1 (Free Tier) | ~$0 | 8h setup + 4h/mes × 12 = $560 | $560 |
| Año 2 en adelante | $96/año | 4h/mes × 12 = $480/año | $576/año |

**Desglose mensual base**:
- Instancia `t4g.micro` 24/7 → $6.13
- EBS gp3 20 GB → $1.60
- Snapshots EBS (backups manuales) → ~$0.50
- **Total → ~$8.23/mes**

---

## 3. Arquitectura

```
[Vercel - red pública]  ──(internet + SSL)──>  [EC2 con MySQL en AWS]
```

Igual que RDS público — la EC2 debe tener IP pública para que Vercel la alcance, con SSL forzado y firewall a nivel security group.

---

## 4. Configuración óptima

### 4.1 EC2

| Campo | Valor recomendado | Justificación |
|---|---|---|
| AMI | Amazon Linux 2023 (ARM64) | Más reciente, optimizada AWS |
| Instance type | `t4g.micro` | Suficiente para 10–50 users |
| Architecture | ARM64 (Graviton) | 20% más barata que x86 |
| Key pair | Crear nueva: `nvh-ec2-key.pem` | Para SSH |
| VPC | Default | Simplicidad |
| Subnet | Default pública | Necesita IP pública |
| Auto-assign public IP | ✅ Enable | Vercel debe alcanzarla |
| Storage | 20 GB gp3 | Inicial |
| Security group | `nvh-ec2-mysql-sg` | Aislado y nombrado |
| Instance termination protection | ✅ ON | Que no se borre por accidente |

### 4.2 MySQL

| Campo | Valor recomendado | Justificación |
|---|---|---|
| Versión | MySQL 8.0.x | Coincide con Prisma |
| Bind address | `0.0.0.0` | Acepta conexiones externas |
| Port | `3306` | Default |
| `require_secure_transport` | ON | Fuerza SSL |
| `max_connections` | 100 | Suficiente para Vercel |
| `innodb_buffer_pool_size` | 512MB (50% RAM) | Performance |
| Root user remoto | ❌ Bloquear | Solo localhost |
| App user | `nvh_admin` | Solo para la app |

---

## 5. Paso a paso AWS Console

### Paso 1 — Crear key pair

```
EC2 → Network & Security → Key Pairs → Create key pair
- Name: nvh-ec2-key
- Type: RSA
- Format: .pem
```

⚠️ **Descargá el .pem y guardalo seguro**. Si lo perdés, no podés entrar a la EC2 nunca más.

```bash
# En tu máquina, asegurar permisos
chmod 400 ~/Downloads/nvh-ec2-key.pem
```

### Paso 2 — Crear security group

```
EC2 → Security Groups → Create security group
- Name: nvh-ec2-mysql-sg
- VPC: Default
```

Inbound rules:
| Type | Port | Source | Descripción |
|---|---|---|---|
| SSH | 22 | Tu IP / Mi IP | Solo vos podés entrar |
| MySQL/Aurora | 3306 | 0.0.0.0/0 | Vercel sin IPs fijas |
| HTTPS | 443 | 0.0.0.0/0 | Updates del SO |

### Paso 3 — Lanzar la EC2

```
EC2 → Instances → Launch instance
- Name: nvh-mysql-prod
- AMI: Amazon Linux 2023 (64-bit ARM)
- Instance type: t4g.micro
- Key pair: nvh-ec2-key
- Network: Default VPC, Default subnet
- Auto-assign public IP: Enable
- Security group: usar existente → nvh-ec2-mysql-sg
- Storage: 20 GB gp3
- Advanced details → Termination protection: Enable
```

Tarda ~2 minutos. Anotá la **Public IPv4 address**.

### Paso 4 — Conectar por SSH

```bash
ssh -i ~/Downloads/nvh-ec2-key.pem ec2-user@TU-IP-PUBLICA
```

### Paso 5 — Actualizar SO e instalar MySQL 8

```bash
sudo dnf update -y

# Repositorio oficial MySQL
sudo dnf install -y https://dev.mysql.com/get/mysql80-community-release-el9-1.noarch.rpm

# Importar GPG key
sudo rpm --import https://repo.mysql.com/RPM-GPG-KEY-mysql-2023

# Instalar
sudo dnf install -y mysql-community-server

# Iniciar y habilitar
sudo systemctl enable --now mysqld

# Ver el password temporal del root
sudo grep 'temporary password' /var/log/mysqld.log
```

### Paso 6 — Asegurar MySQL

```bash
sudo mysql_secure_installation
```

Responder:
- Password actual: el temporal que apareció arriba
- Set new root password: **password fuerte 32+ chars**
- Remove anonymous users: **Y**
- Disallow root login remotely: **Y**
- Remove test database: **Y**
- Reload privilege tables: **Y**

### Paso 7 — Crear DB y usuario para la app

```bash
mysql -u root -p
```

```sql
CREATE DATABASE novahold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Crear usuario que SOLO acepta SSL
CREATE USER 'nvh_admin'@'%' IDENTIFIED BY 'PASSWORD-FUERTE-AQUI' REQUIRE SSL;

GRANT ALL PRIVILEGES ON novahold.* TO 'nvh_admin'@'%';
FLUSH PRIVILEGES;

EXIT;
```

### Paso 8 — Configurar MySQL para conexiones externas + SSL forzado

Editar `/etc/my.cnf`:

```bash
sudo nano /etc/my.cnf
```

Agregar/modificar bajo `[mysqld]`:

```ini
[mysqld]
bind-address = 0.0.0.0
require_secure_transport = ON
max_connections = 100
innodb_buffer_pool_size = 512M
log_error = /var/log/mysqld.log
slow_query_log = 1
slow_query_log_file = /var/log/mysql-slow.log
long_query_time = 1
```

Reiniciar:

```bash
sudo systemctl restart mysqld
```

### Paso 9 — Generar certificados SSL

MySQL 8 los genera solos al instalar. Verificar:

```bash
ls -la /var/lib/mysql/*.pem
```

Deberías ver `ca.pem`, `server-cert.pem`, `server-key.pem`. Copiá `ca.pem` a tu máquina:

```bash
# Desde tu máquina
scp -i ~/Downloads/nvh-ec2-key.pem ec2-user@TU-IP:/var/lib/mysql/ca.pem ./rds-ca.pem
```

---

## 6. Construir la `DATABASE_URL` para Next.js

### 6.1 Anatomía de la URL

```
mysql://USER:PASSWORD@HOST:PORT/DATABASE
   │       │      │       │    │      │
   │       │      │       │    │      └─ nombre de la base de datos
   │       │      │       │    └──────── puerto MySQL (3306)
   │       │      │       └───────────── IP pública de la EC2
   │       │      └───────────────────── password del usuario MySQL
   │       └──────────────────────────── usuario de la app
   └──────────────────────────────────── protocolo MySQL
```

### 6.2 De dónde sacar cada parte

| Parte | Valor | Dónde encontrarlo |
|---|---|---|
| `USER` | `nvh_admin` | El que creaste con `CREATE USER` en el paso 7 |
| `PASSWORD` | (lo que pusiste vos) | El que pusiste en `CREATE USER` |
| `HOST` | `54.123.45.67` (ejemplo) | EC2 → tu instancia → **Public IPv4 address** |
| `PORT` | `3306` | Default MySQL |
| `DATABASE` | `novahold` | El que creaste con `CREATE DATABASE` |

⚠️ **La IP pública de la EC2 cambia si reiniciás la instancia**. Si querés una IP estable, asociá un **Elastic IP** (gratis mientras esté asociada a una instancia activa):

```
EC2 → Elastic IPs → Allocate Elastic IP → Associate to instance: nvh-mysql-prod
```

Si la asociás, usá esa IP fija en `DATABASE_URL`.

### 6.3 ⚠️ URL-encodear el password (IMPORTANTÍSIMO)

Si el password tiene caracteres especiales, **TENÉS QUE URL-encodearlos** o la URL se rompe.

Tabla crítica:

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

Password: `xK9!mPQ@2#aB&z` → encoded: `xK9!mPQ%402%23aB%26z`

URL final:
```
mysql://nvh_admin:xK9!mPQ%402%23aB%26z@54.123.45.67:3306/novahold
```

**Tip rápido en Node.js**:
```javascript
encodeURIComponent('xK9!mPQ@2#aB&z')
// → 'xK9!mPQ%402%23aB%26z'
```

### 6.4 ⚠️ SSL con cert auto-firmado de MySQL (caso EC2)

A diferencia de RDS/Aurora (que tienen certs firmados por AWS), MySQL en EC2 genera **certs auto-firmados** durante la instalación. Eso significa que `rejectUnauthorized: true` te va a fallar a menos que confíes manualmente en el cert.

#### Opción A — Aceptar el cert auto-firmado (más fácil, menos seguro)

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
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: isProd ? { rejectUnauthorized: false } : undefined, // 👈 acepta cert auto-firmado
  });
}
```

#### Opción B — Confiar en el CA específico de tu MySQL (recomendado)

1. Descargaste `ca.pem` en el paso 9. Movelo a `src/lib/mysql-ca.pem`.
2. Importalo en el adapter:

```typescript
import { readFileSync } from 'fs';
import { join } from 'path';

const ca = readFileSync(join(process.cwd(), 'src/lib/mysql-ca.pem'), 'utf-8');

function createAdapter() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/novahold');
  const isProd = process.env.NODE_ENV === 'production';

  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: decodeURIComponent(url.password),
    database: url.pathname.slice(1),
    ssl: isProd ? { ca, rejectUnauthorized: true } : undefined,
  });
}
```

⚠️ **Importante**: el `ca.pem` cambia si reinstalás MySQL. Guardá una copia segura.

### 6.5 Configurar la URL en cada entorno

#### A) Desarrollo local (`.env.local`)

```bash
DATABASE_URL="mysql://root:root@localhost:3306/novahold"
```

> `.env.local` está en `.gitignore` por default. NUNCA pongas el password de prod ahí.

#### B) Producción Vercel

```
Vercel → tu proyecto → Settings → Environment Variables → Add New
```

| Campo | Valor |
|---|---|
| Key | `DATABASE_URL` |
| Value | `mysql://nvh_admin:PASSWORD-ENCODED@TU-IP-EC2:3306/novahold` |
| Environments | ✅ Production |

⚠️ Si cambiás de IP (reiniciás EC2 sin Elastic IP), tenés que actualizar este valor y redeploy.

#### C) Aplicar el cambio

```
Vercel → Deployments → último deploy → ⋯ → Redeploy
```

### 6.6 Verificar que funciona

En logs de Vercel:

✅ **Bien**:
```
Database connected
GET / 200 in 234ms
```

❌ **Mal**:
| Error | Causa |
|---|---|
| `connect ETIMEDOUT` | Security group no permite la IP, o la EC2 está apagada |
| `Access denied for user` | Password con char especial sin encodear |
| `unable to verify the first certificate` | Estás usando `rejectUnauthorized: true` sin pasar el `ca.pem` |
| `Connections using insecure transport are prohibited` | MySQL forzó SSL pero el adapter no lo está usando |

### 6.7 Cheatsheet final

```bash
# Local (.env.local)
DATABASE_URL="mysql://root:root@localhost:3306/novahold"

# Producción Vercel (con Elastic IP fija)
DATABASE_URL="mysql://nvh_admin:xK9%21mPQ%402aB@54.123.45.67:3306/novahold"
```

---

## 7. Backups (CRÍTICO — vos sos responsable)

⚠️ **Sin esto, perdés todos los datos si la EC2 se rompe.**

### 7.1 Crear bucket S3 para backups

```
S3 → Create bucket
- Name: nvh-mysql-backups-{tu-cuenta-id}
- Region: misma que la EC2
- Block all public access: ✅
- Versioning: Enable
- Encryption: SSE-S3 (default)
- Lifecycle rule: borrar objetos > 30 días
```

### 7.2 Crear IAM role para la EC2

```
IAM → Roles → Create role
- Trusted entity: EC2
- Permissions: AmazonS3FullAccess (o policy custom solo a tu bucket)
- Name: nvh-ec2-mysql-role
```

Asignar role a la EC2:
```
EC2 → tu instancia → Actions → Security → Modify IAM role
→ nvh-ec2-mysql-role
```

### 7.3 Instalar AWS CLI en la EC2

```bash
sudo dnf install -y awscli
aws --version
```

### 7.4 Script de backup diario

```bash
sudo nano /home/ec2-user/backup-mysql.sh
```

Contenido:

```bash
#!/bin/bash
set -e
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="/tmp/novahold-${TIMESTAMP}.sql.gz"
S3_BUCKET="nvh-mysql-backups-{tu-cuenta-id}"

mysqldump -u root -p'TU-PASSWORD-ROOT' \
  --single-transaction --routines --triggers --events \
  novahold | gzip > "$BACKUP_FILE"

aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/daily/"

rm "$BACKUP_FILE"

echo "[$(date)] Backup completed → $S3_BUCKET/daily/$(basename $BACKUP_FILE)"
```

```bash
sudo chmod +x /home/ec2-user/backup-mysql.sh
```

### 7.5 Cron diario a las 2am Colombia (= 7am UTC)

```bash
sudo crontab -e
```

Agregar:
```
0 7 * * * /home/ec2-user/backup-mysql.sh >> /var/log/mysql-backup.log 2>&1
```

### 7.6 Verificar mañana

```bash
aws s3 ls s3://nvh-mysql-backups-{tu-cuenta-id}/daily/
```

---

## 8. Monitoreo (CloudWatch)

### 8.1 Instalar CloudWatch Agent

```bash
sudo dnf install -y amazon-cloudwatch-agent
```

### 8.2 Configurar métricas básicas

```bash
sudo /opt/aws/amazon-cloudwatch-agent/bin/amazon-cloudwatch-agent-config-wizard
```

Responder:
- OS: Linux
- EC2 detection: yes
- Use SSM parameter: no
- Metrics: Basic (CPU, mem, disk)
- StatsD: no
- CollectD: no
- Monitor logs: yes → `/var/log/mysqld.log`, `/var/log/mysql-slow.log`

### 8.3 Crear alarmas críticas

En `CloudWatch → Alarms → Create alarm`:

| Métrica | Threshold | Acción |
|---|---|---|
| CPU > 80% por 10min | crítico | Email |
| Disk > 80% | crítico | Email |
| MySQL service down | crítico | Email |

---

## 9. Patches y updates (mensuales mínimo)

```bash
# Sistema operativo
sudo dnf update -y

# MySQL minor patches
sudo dnf update mysql-community-server -y
sudo systemctl restart mysqld
```

⚠️ **Agregalo al calendario, primer sábado de cada mes**. Si lo olvidás, exponés la DB a vulnerabilidades conocidas.

---

## 10. Alertas de presupuesto

```
AWS Billing → Budgets → Create budget
- Name: nvh-ec2-cap
- Period: Monthly
- Amount: USD 12 (margen sobre $8 esperado)
- Alerts: 50%, 80%, 100%
- Email: tu mail
```

---

## 11. Restore — qué hacer si se rompe todo

```bash
# Bajar el último backup
aws s3 cp s3://nvh-mysql-backups-XXX/daily/novahold-LATEST.sql.gz /tmp/

# Descomprimir
gunzip /tmp/novahold-LATEST.sql.gz

# Si la EC2 sigue viva: restaurar
mysql -u root -p novahold < /tmp/novahold-LATEST.sql

# Si la EC2 murió: lanzar nueva, instalar MySQL, restaurar
```

⚠️ **Practicá un restore al menos 1 vez**. Un backup que nunca probaste no es un backup, es una ilusión.

---

## 12. Checklist final

- [ ] EC2 corriendo, status `running`
- [ ] SSH funciona
- [ ] MySQL corriendo (`sudo systemctl status mysqld`)
- [ ] DB `novahold` creada
- [ ] Usuario `nvh_admin` creado con `REQUIRE SSL`
- [ ] `require_secure_transport=ON` en my.cnf
- [ ] Security group restringe SSH a tu IP
- [ ] IAM role asignado a la EC2
- [ ] Bucket S3 de backups creado
- [ ] Script `backup-mysql.sh` ejecutado manualmente y subió a S3
- [ ] Cron instalado y verificado
- [ ] CloudWatch agent instalado
- [ ] Alarmas creadas (CPU, disk, MySQL down)
- [ ] **Restore de prueba** ejecutado al menos 1 vez
- [ ] Termination protection ON
- [ ] Vercel `DATABASE_URL` apunta a la IP pública con SSL
- [ ] App carga el login en producción
- [ ] Budget alert configurado

---

## 13. Errores comunes a evitar

| Error | Consecuencia |
|---|---|
| No configurar backups | Perdés todo si falla el disco |
| No probar el restore | Backup que no se prueba no funciona |
| SSH abierto a 0.0.0.0/0 | Brute force 24/7 |
| Password root remoto habilitado | Compromiso total con un solo password |
| Olvidar parches mensuales | Vulnerabilidades públicas |
| EBS sin snapshots | Sin red de seguridad ante corrupción |
| Termination protection OFF | Borrado accidental |
| MySQL bind 127.0.0.1 | Vercel no puede conectar |

---

## 14. ¿Cuándo migrar a RDS?

Considerá migrar a RDS si:

- La empresa contrata un segundo dev y vos no sos más el único responsable
- La DB pasó los 50 GB
- Hubo un incidente de pérdida de datos (señal de que el modelo no funciona)
- Las horas que pasás haciendo de DBA superan claramente el ahorro mensual
- Necesitás Multi-AZ para HA (imposible en EC2 sin trabajo enorme)

La migración EC2 → RDS es directa: snapshot → import a RDS → cambiar `DATABASE_URL` en Vercel.

---

**Resumen**: con esta config tenés MySQL en EC2 funcionando con backups, monitoreo y SSL. Pagás ~$8/mes pero invertís ~4h/mes en mantenimiento. Es viable, **pero solo elegí esto si tenés conciencia de que sos vos el DBA**. Si los datos del inventario son críticos para la empresa, RDS es la opción correcta.

---

## 15. Exposición segura para Vercel — receta completa de hardening

> ⚠️ **Importantísimo**: ejecutá esta sección **ANTES** de pegar la `DATABASE_URL` en Vercel y antes de migrar datos reales. Una EC2 con MySQL expuesto sin hardening es un blanco para bots las 24 horas desde el primer minuto.

### 15.1 El problema central

Como Vercel no tiene IPs fijas, MySQL tiene que estar abierto a `0.0.0.0/0`. Tu única defensa real es una capa profunda de hardening — no podés depender de firewall por IP.

```
[Vercel - sin IPs fijas]
   │ (TLS 1.3 + cert validation)
   │
   ▼  conexión TCP encriptada
[EC2 puerto 8306]  ← cambiado, no el 3306 default
   │
   ├─ fail2ban activo (banea bots después de 5 fallos)
   ├─ MySQL con usuario app de mínimos privilegios
   ├─ SSL obligatorio (require_secure_transport=ON)
   ├─ EBS encriptado at rest
   └─ Audit log de cada conexión
```

### 15.2 Las 4 superficies de ataque

| Superficie | Riesgo | Mitigación principal |
|---|---|---|
| **SSH (puerto 22)** | Brute force, credenciales robadas | Cerrar al mundo, usar Session Manager |
| **MySQL (3306/8306)** | Brute force, exploits MySQL | Puerto custom + password 32+ chars + SSL + fail2ban |
| **OS Linux** | Vulnerabilidades sin parchear | Auto-updates de seguridad |
| **Datos en disco** | Robo de EBS, snapshots filtrados | EBS encryption desde la creación |

---

### 15.3 Receta paso a paso (en este orden)

#### Paso A — Cambiar el puerto MySQL de 3306 a 8306

Suena tonto pero **mata el 95% del tráfico de bots**. Los scanners automáticos atacan `3306`, no `8306`.

Editar `/etc/my.cnf`:

```ini
[mysqld]
port = 8306
bind-address = 0.0.0.0
require_secure_transport = ON
max_connections = 50
log_error = /var/log/mysqld.log
slow_query_log = 1
slow_query_log_file = /var/log/mysql-slow.log
long_query_time = 1
innodb_buffer_pool_size = 512M
```

Reiniciar:
```bash
sudo systemctl restart mysqld
```

Verificar que MySQL escucha en 8306:
```bash
sudo netstat -tlnp | grep mysql
# Debe mostrar: 0.0.0.0:8306
```

#### Paso B — Security Group: solo 8306, NO el 22 al mundo

```
EC2 → Security Groups → nvh-ec2-mysql-sg
```

**Inbound rules (estado final)**:

| Type | Port | Source | Descripción |
|---|---|---|---|
| Custom TCP | 8306 | 0.0.0.0/0 | MySQL — Vercel sin IPs fijas |
| HTTPS | 443 | 0.0.0.0/0 | Updates del SO |
| ❌ ELIMINAR | 22 | 0.0.0.0/0 | NO dejes SSH abierto al mundo |

#### Paso C — Reemplazar SSH por Session Manager

Sin SSH expuesto, ¿cómo entrás a la EC2? Con **AWS Session Manager** — gratis, sin IP, sin keys, todo registrado en CloudTrail:

```bash
sudo dnf install -y amazon-ssm-agent
sudo systemctl enable --now amazon-ssm-agent
```

Para que la EC2 pueda hablar con SSM, agregale el role IAM con la política `AmazonSSMManagedInstanceCore`:

```
EC2 → tu instancia → Actions → Security → Modify IAM role
→ usar el role nvh-ec2-mysql-role (paso 7.2 de la sección 7)
→ adjuntar política AmazonSSMManagedInstanceCore
```

Después conectás desde el Console:
```
EC2 → tu instancia → Connect → Session Manager → Connect
```

Ya no necesitás `ssh -i nvh-ec2-key.pem ...`. El `.pem` lo guardás como backup por si Session Manager falla.

#### Paso D — Usuario MySQL de mínimos privilegios

⚠️ **El usuario que pone Vercel en `DATABASE_URL` NO debe ser admin**. Si Vercel se compromete, este usuario es lo único que el atacante tiene.

Conectate a MySQL como root y ejecutá:

```sql
-- Generar password fuerte primero (en tu máquina):
-- openssl rand -base64 32
-- Ejemplo de salida: xK9!mPQ2#aB4vN7zR1tY8wL5jH3gF6dC=

-- Crear usuario de la app con permisos MÍNIMOS
CREATE USER 'nvh_app'@'%' IDENTIFIED BY 'TU-PASSWORD-32-CHARS' REQUIRE SSL;

-- Solo CRUD sobre la DB de novahold
GRANT SELECT, INSERT, UPDATE, DELETE ON novahold.* TO 'nvh_app'@'%';

-- IMPORTANTE: NO le des estos privilegios:
-- CREATE, DROP, ALTER, FILE, SUPER, PROCESS, GRANT OPTION, RELOAD

FLUSH PRIVILEGES;

-- Verificar
SHOW GRANTS FOR 'nvh_app'@'%';
-- Debe mostrar SOLO: GRANT SELECT, INSERT, UPDATE, DELETE ON `novahold`.* TO `nvh_app`@`%`
```

⚠️ **El usuario `nvh_admin` que creaste en el paso 7 (que tenía ALL PRIVILEGES) NO va a Vercel**. Ese queda solo para tareas administrativas vía Session Manager. El usuario para la `DATABASE_URL` de Vercel es **`nvh_app`**.

#### Paso E — fail2ban contra brute force

```bash
sudo dnf install -y fail2ban
```

Crear filter para MySQL — `/etc/fail2ban/filter.d/mysqld-auth.conf`:

```ini
[Definition]
failregex = ^.*\[Note\] Access denied for user .* \(using password: YES\).*$
            ^.*\[Warning\] Access denied for user .*$
ignoreregex =
```

Crear jail config — `/etc/fail2ban/jail.local`:

```ini
[DEFAULT]
bantime  = 3600
findtime = 600
maxretry = 3
backend  = systemd

[mysqld-auth]
enabled  = true
filter   = mysqld-auth
port     = 8306
logpath  = /var/log/mysqld.log
maxretry = 5
bantime  = 7200
```

Activar:
```bash
sudo systemctl enable --now fail2ban
sudo fail2ban-client status mysqld-auth
```

A las 24-48 horas verificar que esté baneando bots:
```bash
sudo fail2ban-client status mysqld-auth
# Banned IP list: ...
```

Si está vacío, sospechá. Si tiene 0 baneos en 48h en una IP pública, algo está mal con el filter o los logs.

#### Paso F — Audit log de MySQL (cada conexión registrada)

```sql
INSTALL COMPONENT 'file://component_audit_log_filter';

SELECT audit_log_filter_set_filter('log_all', '{ "filter": { "log": true } }');
SELECT audit_log_filter_set_user('%', 'log_all');

-- Verificar que está activo
SHOW VARIABLES LIKE 'audit_log%';
```

Esto registra **cada conexión y query** en `/var/lib/mysql/audit.log`. Si hay incidente, tenés evidencia forense.

Configurá rotación para que no llene el disco — `/etc/logrotate.d/mysql-audit`:

```
/var/lib/mysql/audit.log {
    daily
    rotate 30
    compress
    missingok
    notifempty
    copytruncate
}
```

#### Paso G — Auto-updates de seguridad del OS

```bash
sudo dnf install -y dnf-automatic
```

Editar `/etc/dnf/automatic.conf`:

```ini
[commands]
upgrade_type = security
apply_updates = yes
random_sleep = 0

[emitters]
emit_via = stdio

[email]
email_from = root@localhost
email_to = root
```

Activar:
```bash
sudo systemctl enable --now dnf-automatic.timer
sudo systemctl status dnf-automatic.timer
```

Esto aplica solo updates **de seguridad** automáticamente. Para parches mayores siempre vas a tener que entrar vos manualmente.

#### Paso H — Verificar EBS encriptado at rest

⚠️ Si NO marcaste "Encrypted" al crear la EC2 en el paso 3 de la sección 5, **no se puede agregar después**. Tenés que migrar a un volumen nuevo.

Verificar:
```
EC2 → tu instancia → Storage → Block devices → click en el volumen → Encryption: Encrypted ✅
```

Si dice "Not encrypted":
1. Hacer snapshot del volumen actual
2. Crear copia del snapshot con encryption ON
3. Crear volumen nuevo desde el snapshot encriptado
4. Detach del volumen viejo, attach del nuevo
5. Borrar el volumen y snapshot viejos

Hacelo **antes** de meter datos reales — después es una migración con downtime.

---

### 15.4 Construcción de la `DATABASE_URL` final (versión segura)

Recordá los cambios vs la sección 6:

| Campo | Versión inicial | Versión endurecida |
|---|---|---|
| Usuario | `nvh_admin` (admin) | **`nvh_app`** (CRUD only) |
| Puerto | `3306` | **`8306`** |
| SSL | depende | **obligatorio** |

URL final para Vercel:

```
mysql://nvh_app:PASSWORD-URL-ENCODED@TU-IP-EC2:8306/novahold
```

Ejemplo concreto con password URL-encoded:

```
mysql://nvh_app:xK9%21mPQ%402aB4vN7zR1tY8wL5jH3gF6dC%3D@54.123.45.67:8306/novahold
```

En `Vercel → Settings → Environment Variables`:

| Campo | Valor |
|---|---|
| Key | `DATABASE_URL` |
| Value | (URL de arriba) |
| Environments | ✅ Production |

Y `src/lib/prisma.ts` con SSL — usar la **Opción A** (cert auto-firmado) de la sección 6.4:

```typescript
ssl: isProd ? { rejectUnauthorized: false } : undefined,
```

---

### 15.5 Verificación final — los 6 tests que SÍ deben pasar

| Test | Comando | Resultado esperado |
|---|---|---|
| MySQL solo en 8306 | `sudo netstat -tlnp \| grep mysql` | `0.0.0.0:8306` (NO 3306) |
| SSH cerrado al mundo | desde otra red: `nmap -p 22 TU-IP-EC2` | `closed` o `filtered` |
| MySQL responde | `nmap -p 8306 TU-IP-EC2` | `open` |
| SSL obligatorio | `mysql -h IP -P 8306 -u nvh_app -p` (sin --ssl) | `Connections using insecure transport are prohibited` |
| Usuario `nvh_app` sin DROP | conectado: `DROP TABLE novahold.assets;` | `Access denied` |
| fail2ban activo | `sudo fail2ban-client status mysqld-auth` | jail status: `enabled = true` |

Si los 6 pasan, podés mover producción a esta DB con tranquilidad relativa.

---

### 15.6 Lo que NO va a quedar 100% seguro

Aun haciendo TODO esto, seguís dependiendo de:

1. **El password de `nvh_app` no se filtra nunca** — revisá NUNCA commitearlo, ni en logs, ni en screenshots, ni en mensajes de Slack
2. **MySQL no tiene zero-day entre patch y patch** — auto-updates de seguridad mitigan, no eliminan
3. **Vercel no tiene vulnerabilidad que filtre env vars** — fuera de tu control
4. **Tu workstation de admin (Session Manager) no se compromete** — usar 2FA en AWS Console SIEMPRE

Pero con esta receta tu superficie de ataque pasa de "vulnerable y descuidada" a "razonablemente endurecida". Para datos no-PII críticos como inventario interno, es aceptable.

---

### 15.7 Checklist final consolidado de hardening

- [ ] MySQL en puerto **8306** (no 3306)
- [ ] Security Group: solo 8306 + 443, **NO** 22
- [ ] Session Manager funciona (probado entrar)
- [ ] Role IAM con `AmazonSSMManagedInstanceCore` adjunto
- [ ] EBS encriptado at rest (verificado en Console)
- [ ] Usuario `nvh_app` creado con `REQUIRE SSL` y solo CRUD
- [ ] Usuario `nvh_admin` (con todos los privilegios) **NO** está en la URL de Vercel
- [ ] `require_secure_transport = ON` en my.cnf
- [ ] fail2ban corriendo, jail `mysqld-auth` activo
- [ ] Audit log encendido y rotando con logrotate
- [ ] `dnf-automatic.timer` activo (auto-updates de seguridad)
- [ ] Backups a S3 funcionando con encryption SSE-KMS
- [ ] Restore probado al menos 1 vez
- [ ] CloudWatch alarmas: CPU, disk, MySQL down, login failures
- [ ] Budget alert AWS configurado
- [ ] Vercel `DATABASE_URL` apunta a `nvh_app:PASSWORD@IP:8306/novahold`
- [ ] `src/lib/prisma.ts` actualizado con SSL en producción
- [ ] App carga en producción sin errores de conexión
- [ ] 2FA habilitado en la cuenta AWS Console

---

### 15.8 Plan de respuesta a incidentes

Si detectás actividad sospechosa (ej: spike inusual de queries, IP rara en audit log):

1. **Inmediato**: cambiar el password de `nvh_app` y actualizar `DATABASE_URL` en Vercel + redeploy
2. **5 min**: revisar `/var/lib/mysql/audit.log` para ver qué hizo el atacante
3. **15 min**: si hubo escritura, restaurar desde el último backup limpio
4. **30 min**: revisar CloudTrail para ver si tocó AWS console
5. **1h**: rotar TODOS los secrets (AWS keys, GitHub tokens, etc.)
6. **24h**: post-mortem y endurecer el vector que se aprovecharon

Tener este plan **escrito y testeado** es la diferencia entre "incidente menor" y "desastre". Imprimilo y guardalo donde lo veas.
