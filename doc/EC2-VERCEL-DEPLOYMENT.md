# EC2 MySQL + Vercel Hobby — Deployment & Initial User

## Context

El proyecto corre en **Vercel Hobby** y necesita conectarse a una base de datos MySQL 8
alojada en una **instancia EC2 de AWS**. La meta es producción estable con la menor superficie
de ataque posible dado que el plan Hobby no soporta IPs estáticas de egreso.

Antes de ejecutar, hay **4 hallazgos críticos** del código actual que deben resolverse:

| # | Problema | Archivo | Impacto |
|---|----------|---------|---------|
| 1 | SSL no configurado en el adapter — los params en la URL son ignorados | `src/lib/prisma.ts` | Conexión sin cifrar a EC2 |
| 2 | `connectionLimit` no seteado | `src/lib/prisma.ts` | Connection exhaustion bajo carga |
| 3 | Build command no corre `prisma migrate deploy` | `package.json` / Vercel | Schema desincronizado post-deploy |
| 4 | Env var mismatch: `AWS-DEPLOYMENT.md` usa `AUTH_AZURE_AD_ID` pero el código lee `AZURE_AD_CLIENT_ID` | `src/auth.config.ts` | Auth roto si se copian las vars del doc viejo |

---

## Parte 1 — Correcciones de código (ANTES de subir a Vercel)

### 1.1 `src/lib/prisma.ts` — Agregar mTLS, connectionLimit e idleTimeout

```ts
function createAdapter() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/novahold');
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ssl: {
      rejectUnauthorized: true,
      ca:   process.env.DB_SSL_CA?.replace(/\\n/g, '\n'),
      cert: process.env.DB_SSL_CERT?.replace(/\\n/g, '\n'),
      key:  process.env.DB_SSL_KEY?.replace(/\\n/g, '\n'),
      // El driver mariadb hace reverse DNS del IP y obtiene "localhost." como hostname.
      // checkServerIdentity omite ese binding — CA chain + mTLS siguen activos.
      checkServerIdentity: () => undefined,
    } as any,
    connectionLimit: 3,
    idleTimeout: 10,
  });
}
```

Con `REQUIRE X509` en MySQL y `rejectUnauthorized: true` aquí, cualquier conexión sin el
certificado de cliente es rechazada antes de que llegue a la autenticación.

### 1.2 `prisma/seed.ts` — Misma corrección en el adapter del seed

El seed tiene su propio `createAdapter()`. Aplicar el mismo cambio de mTLS allí para que
`pnpm db:seed` funcione correctamente apuntando a EC2.

### 1.3 Build command en Vercel

En el dashboard de Vercel → Settings → Build & Development Settings → Build Command:

```bash
npx prisma generate && npx prisma migrate deploy && next build
```

`migrate deploy` es idempotente y no-interactivo. Corre las migraciones pendientes en cada
deploy antes de que el nuevo código entre en servicio.

---

## Parte 2 — AWS EC2: configuración paso a paso

### 2.1 Lanzar la instancia

| Campo | Valor |
|-------|-------|
| AMI | Ubuntu Server 24.04 LTS |
| Instance type | **t3.small** (2 GiB RAM) — t3.micro no alcanza para `database` session strategy |
| Storage | 30 GiB gp3 |
| IP | **Elastic IP** obligatoria — la IP del host debe ser estable |

### 2.2 Security Group

| Tipo | Puerto | Origen | Por qué |
|------|--------|--------|---------|
| SSH | 22 | Tu IP de administración `/32` | Acceso admin solamente |
| MySQL/Aurora | 3306 | `0.0.0.0/0` | Hobby plan no tiene IPs estáticas de egreso |

> **Por qué 3306 queda abierto**: Vercel Hobby no tiene IPs de egreso estáticas, así que no
> es posible poner un `/32` en el SG. La defensa real no es el SG — es **mTLS**: sin el
> certificado de cliente, el handshake TLS falla antes de que MySQL vea usuario o contraseña.

### 2.3 Instalar MySQL 8

```bash


# opciones: set root password, remove anonymous users,
#            disallow remote root login, remove test DB, reload privileges
```

### 2.4 Configurar MySQL para producción

Editar `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
bind-address             = 0.0.0.0
require_secure_transport = ON
max_connections          = 200
local_infile             = 0
skip-name-resolve
```

### 2.4.1 Opcional — Cambiar el puerto de MySQL

Cambiar el puerto no mejora la seguridad real (mTLS es la barrera), pero elimina el ruido
de bots automatizados que escanean el puerto 3306 en internet.

En `/etc/mysql/mysql.conf.d/mysqld.cnf` agregar:

```ini
port = 13306
```

Actualizar el Security Group — eliminar la regla de 3306 y agregar:

| Tipo | Puerto | Origen |
|------|--------|--------|
| Custom TCP | 13306 | `0.0.0.0/0` |

Actualizar `DATABASE_URL` en Vercel con el nuevo puerto:

```
mysql://novahold_app:<PW>@<ELASTIC_IP>:13306/novahold
```

Reiniciar MySQL: `sudo systemctl restart mysql`

> Cualquier número entre 1024 y 65535 que no esté en uso sirve. 13306 es fácil de recordar.
> Actualizar también la configuración de TablePlus y el script de backup con el nuevo puerto.

---

Reiniciar: `sudo systemctl restart mysql`

### 2.5 Generar CA y certificados mTLS

Correr estos comandos **en la EC2** desde un directorio seguro (ej: `~/certs/`):

```bash
mkdir -p ~/certs && cd ~/certs

# 1. Autoridad certificadora privada (CA)
openssl genrsa 2048 > ca-key.pem
openssl req -new -x509 -nodes -days 3650 -key ca-key.pem -out ca-cert.pem \
  -subj "/CN=novahold-ca"

# 2. Certificado del servidor MySQL
openssl req -newkey rsa:2048 -nodes -keyout server-key.pem -out server-req.pem \
  -subj "/CN=novahold-db-server"
openssl x509 -req -days 3650 -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 01 -in server-req.pem -out server-cert.pem

# 3. Certificado del cliente (la app en Vercel)
openssl req -newkey rsa:2048 -nodes -keyout client-key.pem -out client-req.pem \
  -subj "/CN=novahold-app-client"
openssl x509 -req -days 3650 -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 02 -in client-req.pem -out client-cert.pem
```

Copiar los certs del servidor al directorio de MySQL:

```bash
sudo cp ~/certs/ca-cert.pem     /etc/mysql/ssl/ca-cert.pem
sudo cp ~/certs/server-cert.pem /etc/mysql/ssl/server-cert.pem
sudo cp ~/certs/server-key.pem  /etc/mysql/ssl/server-key.pem
sudo chown -R mysql:mysql /etc/mysql/ssl/
sudo chmod 640 /etc/mysql/ssl/*.pem
```

Apuntar MySQL a esos certs en `/etc/mysql/mysql.conf.d/mysqld.cnf`:

```ini
ssl-ca   = /etc/mysql/ssl/ca-cert.pem
ssl-cert = /etc/mysql/ssl/server-cert.pem
ssl-key  = /etc/mysql/ssl/server-key.pem
```

Reiniciar: `sudo systemctl restart mysql`

Verificar que el servidor arrancó con SSL activo:

```bash
sudo mysql -e "SHOW VARIABLES LIKE '%ssl%';"
# have_ssl debe mostrar YES
```

### 2.6 Crear base de datos y usuario con REQUIRE X509

```sql
-- conectado como root
CREATE DATABASE novahold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'novahold_app'@'%'
  IDENTIFIED BY '<contraseña-32chars>'
  REQUIRE X509;
-- REQUIRE X509 exige un certificado de cliente firmado por tu CA.
-- Sin el cert, el handshake TLS falla antes de que MySQL vea la contraseña.

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_app'@'%';

FLUSH PRIVILEGES;
```

Los permisos DDL (`CREATE/ALTER/DROP`) son necesarios para que `prisma migrate deploy`
pueda aplicar migraciones.

---

## Parte 3 — Variables de entorno en Vercel

Dashboard → Settings → Environment Variables → Production

| Variable | Valor | Notas |
|----------|-------|-------|
| `DATABASE_URL` | `mysql://novahold_app:<PW>@<ELASTIC_IP>:3306/novahold` | Caracteres especiales en PW → percent-encode |
| `DB_SSL_CA` | contenido de `ca-cert.pem` | Copiar el texto completo incluyendo `-----BEGIN CERTIFICATE-----` |
| `DB_SSL_CERT` | contenido de `client-cert.pem` | Ídem |
| `DB_SSL_KEY` | contenido de `client-key.pem` | Ídem — tratar como secreto |
| `AZURE_AD_CLIENT_ID` | (del App Registration en Azure) | Exactamente este nombre — no `AUTH_AZURE_AD_ID` |
| `AZURE_AD_CLIENT_SECRET` | (del App Registration en Azure) | |
| `AZURE_AD_TENANT_ID` | (ID del tenant Azure AD) | |
| `AUTH_SECRET` | `openssl rand -base64 33` | Correr localmente, copiar el output |
| `NEXTAUTH_URL` | `https://<tu-app>.vercel.app` | Necesario para callbacks OAuth |

> **Cómo cargar los certs en Vercel**: en el dashboard, al pegar el valor de una variable
> que es un archivo PEM, pegarlo tal cual con los saltos de línea. Vercel lo almacena como
> texto multilinea correctamente.

**Registrar redirect URI en Azure AD**:
App Registration → Authentication → Redirect URIs → agregar:

```
https://<tu-app>.vercel.app/api/auth/callback/microsoft-entra-id
```

---

## Parte 4 — Usuario inicial

### ¿Qué significa "usuario inicial" en este proyecto?

Auth es 100% Azure AD — no hay contraseñas. Para que alguien pueda ingresar necesita:
1. Que su email exista en el **tenant Azure AD** con dominio `@novahold.com`
2. Que exista un registro en la tabla `User` de MySQL (para RBAC)

### Opción A — Seed estándar (si los emails existen en el tenant)

```bash
# desde tu máquina local, apuntando a la DB de producción
DATABASE_URL='mysql://novahold_app:<PW>@<ELASTIC_IP>:3306/novahold' pnpm db:seed
```

Crea: `admin@novahold.com` (SUPER_ADMIN), `it.admin@novahold.com` (ADMIN), y 3 más.

### Opción B — Email real del cliente

Editar `prisma/seed.ts` antes de correr el seed: cambiar el email del `user-admin`
al email real del administrador, para que la sesión OAuth lo encuentre en la DB.

### Opción C — INSERT manual (más rápido para el primer acceso)

```sql
INSERT INTO `User` (id, email, name, role, createdAt, updatedAt)
VALUES (
  UUID(),
  'usuario.real@novahold.com',
  'Nombre Admin',
  'SUPER_ADMIN',
  NOW(), NOW()
);
```

Esa persona entra con su cuenta Microsoft → NextAuth la autentica vía Azure AD →
encuentra el registro en DB por email → crea la sesión con rol `SUPER_ADMIN`.

### Dominio `@novahold.com` — verificación obligatoria

El guard en `src/auth.config.ts` es `email.endsWith('@novahold.com')`.
Si el tenant del cliente usa otro dominio (ej: `@empresa.com`), **nadie puede entrar**.
En ese caso actualizar esa línea antes de deployar:

```ts
// src/auth.config.ts
return email.toLowerCase().endsWith('@novahold.com');
//                                    ↑ cambiar si el dominio es diferente
```

---

## Parte 5 — Conexión desde TablePlus (acceso admin)

Hay dos formas de conectarte desde tu máquina. **Se recomienda SSH Tunnel** porque
no depende de los certs mTLS del cliente — usa la clave SSH que ya está restringida a tu IP.

### Opción A — SSH Tunnel (recomendada)

TablePlus tiene soporte nativo para SSH tunnels. Configurar así:

**Pestaña principal (Connection):**

| Campo | Valor |
|-------|-------|
| Host | `127.0.0.1` |
| Port | `3306` |
| User | `novahold_app` |
| Password | `<contraseña-32chars>` |
| Database | `novahold` |

**Pestaña SSH:**

| Campo | Valor |
|-------|-------|
| SSH Host | `<ELASTIC_IP>` |
| SSH Port | `22` |
| SSH User | `ubuntu` |
| SSH Key | tu archivo `.pem` de la instancia EC2 |

El tráfico va cifrado por SSH. No necesita los certs mTLS porque la conexión
sale desde la propia EC2 (localhost), donde MySQL no exige el client cert.

> Para que esto funcione, en MySQL el usuario `novahold_app` debe tener `REQUIRE X509`
> solo para conexiones remotas (`'%'`). Si querés simplificar el acceso admin, podés
> crear un segundo usuario sin `REQUIRE X509` pero solo accesible desde `127.0.0.1`:
> ```sql
> CREATE USER 'novahold_admin'@'127.0.0.1' IDENTIFIED BY '<otra-contraseña>';
> GRANT ALL ON novahold.* TO 'novahold_admin'@'127.0.0.1';
> ```
> Ese usuario solo sirve por SSH tunnel — desde internet no existe.

### Opción B — Conexión directa con mTLS

Si preferís conectarte sin SSH tunnel, TablePlus soporta certs SSL.

**Connection:**

| Campo | Valor |
|-------|-------|
| Host | `<ELASTIC_IP>` |
| Port | `3306` |
| User | `novahold_app` |
| Password | `<contraseña-32chars>` |
| Database | `novahold` |

**Pestaña SSL:**

| Campo | Archivo |
|-------|---------|
| CA Certificate | `~/certs/ca-cert.pem` |
| Client Certificate | `~/certs/client-cert.pem` |
| Client Key | `~/certs/client-key.pem` |
| SSL Mode | `Require` |

Guardar los 3 archivos `.pem` en tu máquina local (copiarlos desde la EC2 vía `scp`):

```bash
scp -i <tu-key.pem> ubuntu@<ELASTIC_IP>:~/certs/ca-cert.pem ~/certs/
scp -i <tu-key.pem> ubuntu@<ELASTIC_IP>:~/certs/client-cert.pem ~/certs/
scp -i <tu-key.pem> ubuntu@<ELASTIC_IP>:~/certs/client-key.pem ~/certs/
```

---

## Parte 6 — Backup mensual automático

### 6.1 Script de dump

Crear el script en la EC2:

```bash
sudo mkdir -p /opt/backups
sudo nano /opt/backups/backup-novahold.sh
```

Contenido del script:

```bash
#!/bin/bash
set -euo pipefail

BACKUP_DIR="/opt/backups"
DATE=$(date +%Y-%m-%d)
FILENAME="novahold-${DATE}.sql.gz"
CERTS_DIR="/etc/mysql/ssl"

mysqldump \
  --ssl-ca="${CERTS_DIR}/ca-cert.pem" \
  --ssl-cert="${CERTS_DIR}/server-cert.pem" \
  --ssl-key="${CERTS_DIR}/server-key.pem" \
  --single-transaction \
  --routines \
  --triggers \
  --set-gtid-purged=OFF \
  -u novahold_app -p'<contraseña-32chars>' \
  novahold | gzip > "${BACKUP_DIR}/${FILENAME}"

# Borrar backups con más de 90 días
find "${BACKUP_DIR}" -name "novahold-*.sql.gz" -mtime +90 -delete

echo "Backup completado: ${BACKUP_DIR}/${FILENAME}"
```

Dar permisos de ejecución:

```bash
sudo chmod +x /opt/backups/backup-novahold.sh
```

### 6.2 Probar el script manualmente

```bash
sudo /opt/backups/backup-novahold.sh
ls -lh /opt/backups/
# debe aparecer: novahold-2026-06-03.sql.gz
```

Verificar que el dump es válido:

```bash
zcat /opt/backups/novahold-2026-06-03.sql.gz | head -20
# debe mostrar el header de mysqldump con CREATE TABLE, etc.
```

### 6.3 Programar cron mensual

```bash
sudo crontab -e
```

Agregar esta línea (corre el día 1 de cada mes a las 2:00 AM):

```
0 2 1 * * /opt/backups/backup-novahold.sh >> /var/log/novahold-backup.log 2>&1
```

Verificar que quedó registrado:

```bash
sudo crontab -l
```

### 6.4 Descargar el backup a tu PC local

**Desde terminal (Mac / Linux):**

```bash
# Descargar el último backup al escritorio
scp -i <tu-key.pem> \
  ubuntu@<ELASTIC_IP>:/opt/backups/novahold-2026-06-03.sql.gz \
  ~/Desktop/novahold-2026-06-03.sql.gz
```

Si no sabés el nombre exacto del archivo, primero listá los backups disponibles:

```bash
ssh -i <tu-key.pem> ubuntu@<ELASTIC_IP> "ls -lh /opt/backups/"
```

Y luego descargá el que necesitás.

**Descargar siempre el más reciente con un solo comando:**

```bash
LAST=$(ssh -i <tu-key.pem> ubuntu@<ELASTIC_IP> \
  "ls -t /opt/backups/novahold-*.sql.gz | head -1")
scp -i <tu-key.pem> ubuntu@<ELASTIC_IP>:"${LAST}" ~/Desktop/
```

**Desde Windows (PowerShell):**

```powershell
scp -i C:\Users\TuUsuario\.ssh\tu-key.pem `
  ubuntu@<ELASTIC_IP>:/opt/backups/novahold-2026-06-03.sql.gz `
  C:\Users\TuUsuario\Desktop\novahold-2026-06-03.sql.gz
```

**Desde Windows con WinSCP (interfaz gráfica):**

1. Abrir WinSCP → New Session
2. File protocol: `SFTP`
3. Host: `<ELASTIC_IP>` · Port: `22` · Username: `ubuntu`
4. Advanced → SSH → Authentication → Private key file: seleccionar tu `.pem`
5. Conectar → navegar a `/opt/backups/` → arrastrar el archivo al escritorio

---

### 6.5 Restaurar un backup (cuando se necesite)

```bash
# En la EC2, descomprimir y restaurar
zcat /opt/backups/novahold-2026-06-03.sql.gz | mysql \
  --ssl-ca=/etc/mysql/ssl/ca-cert.pem \
  --ssl-cert=/etc/mysql/ssl/server-cert.pem \
  --ssl-key=/etc/mysql/ssl/server-key.pem \
  -u novahold_app -p novahold
```

### 6.6 Opcional — Subir backup a S3

Si se quiere guardar los backups fuera de la EC2 (recomendado para disaster recovery),
instalar AWS CLI y agregar estas líneas al script después del `gzip`:

```bash
# instalar una vez: sudo apt install -y awscli
# configurar una vez: aws configure (IAM user con solo s3:PutObject en el bucket)

aws s3 cp "${BACKUP_DIR}/${FILENAME}" "s3://<tu-bucket>/novahold-backups/${FILENAME}"
```

---

## Parte 7 — Checklist de validación post-deploy

- [ ] `curl https://<app>.vercel.app/api/health` → 200 OK
- [ ] Abrir `/login` → redirige a Microsoft login
- [ ] Ingresar con email `@novahold.com` → llega al dashboard
- [ ] Vercel Function Logs → sin errores de conexión MySQL
- [ ] MySQL EC2: `SHOW STATUS LIKE 'Ssl_cipher';` desde la conexión → muestra cipher activo
- [ ] MySQL EC2: `SHOW PROCESSLIST;` durante carga → connections < 20
- [ ] TablePlus conecta por SSH tunnel sin errores
- [ ] Backup manual ejecuta sin errores y genera archivo `.sql.gz` válido
- [ ] `sudo crontab -l` muestra la línea del cron mensual

---

## Escalación futura

| Trigger | Acción |
|---------|--------|
| Más de 20 conexiones concurrentes en MySQL | Instalar ProxySQL en la misma EC2 |
| Necesidad de IP fija en egreso | Upgradar a Vercel Pro → Secure Compute → lockear SG a `/32` y sacar mTLS si se desea simplificar |
| Rotar certificados de cliente | Generar nuevo `client-cert/key`, actualizar las 2 env vars en Vercel, redeploy |
| Cert del servidor vencido (3650 días) | Repetir paso 2.5 para server-cert y server-key, reiniciar MySQL |

---

## Archivos críticos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/prisma.ts` | Agregar mTLS (`ssl` con ca/cert/key), `connectionLimit`, `idleTimeout` |
| `prisma/seed.ts` | Mismo cambio de mTLS en su propio `createAdapter()` |
| `src/auth.config.ts` | Verificar/actualizar dominio guard si el tenant no es `@novahold.com` |
| Vercel Dashboard | Build Command + 9 env vars (6 anteriores + `DB_SSL_CA`, `DB_SSL_CERT`, `DB_SSL_KEY`) |

---

## Parte 8 — Ciclo de migraciones: cómo afectan a producción

### ¿Qué es una migración y cuándo ocurre?

Cada vez que el schema de la base de datos cambia — nueva tabla, nueva columna, nuevo índice,
cambio de tipo — Prisma genera un archivo de migración en `prisma/migrations/`. Ese archivo
contiene el SQL que transforma la DB al nuevo estado.

**Esto pasa en el desarrollo normal**: agregar un módulo, agregar un campo a un formulario,
implementar una feature que necesita una tabla nueva.

### El flujo completo cada vez que hay un cambio de schema

```
Desarrollador modifica prisma/schema.prisma
         │
         ▼
npx prisma migrate dev --name <nombre>   ← corre LOCAL, genera el archivo SQL
         │
         ▼
git commit + git push
         │
         ▼
Vercel detecta el push → inicia build
         │
         ▼
npx prisma migrate deploy                ← corre en Vercel, conecta a EC2
         │                                 aplica el SQL pendiente a producción
         ▼
next build → deploy
```

> **Punto crítico**: `prisma migrate deploy` corre en cada deploy de Vercel y aplica
> automáticamente todas las migraciones pendientes. Si falla, el deploy falla y la app
> anterior sigue corriendo. Si pasa, el nuevo código y el nuevo schema entran juntos.

### Por qué puede fallar `prisma migrate deploy` en este setup

El usuario `novahold_app` tiene `REQUIRE X509` — exige certificados mTLS para conectar.
El CLI de Prisma que corre en Vercel usa su propio conector de red y no tiene acceso a los
certs que están en las env vars del adapter (`DB_SSL_CA`, `DB_SSL_CERT`, `DB_SSL_KEY`).

**Solución**: usar un segundo usuario de MySQL sin `REQUIRE X509` exclusivamente para
migraciones. La seguridad de este usuario descansa en la contraseña fuerte — no en mTLS.

### 8.1 Crear el usuario de migraciones (una sola vez, permanente)

En EC2 vía `sudo mysql`:

```sql
USE novahold;

CREATE USER 'novahold_migrate'@'%'
  IDENTIFIED BY '<contraseña-distinta-32chars>';

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_migrate'@'%';

FLUSH PRIVILEGES;
```

> Este usuario debe quedarse **permanente**. Cada deploy de Vercel lo necesita para correr
> `prisma migrate deploy`. Si lo eliminás, el próximo deploy que tenga una migración pendiente
> fallará con P1000 (authentication failed).

### 8.2 Agregar la variable de entorno en Vercel

Dashboard → Settings → Environment Variables → Production:

| Variable | Valor |
|---|---|
| `MIGRATE_DATABASE_URL` | `mysql://novahold_migrate:<PW>@13.216.111.219:3306/novahold` |

> Los caracteres especiales en la contraseña deben ir percent-encoded:
> `@` → `%40`, `#` → `%23`, `!` → `%21`

### 8.3 Actualizar el build command en Vercel

Dashboard → Settings → Build & Development Settings → Build Command:

```bash
npx prisma generate && DATABASE_URL=$MIGRATE_DATABASE_URL npx prisma migrate deploy && next build
```

Con esto:
- `prisma migrate deploy` usa `novahold_migrate` (sin X509) → conecta sin certs ✓
- La app en runtime usa `novahold_app` (con X509, desde `DATABASE_URL`) → mTLS completo ✓

### 8.4 Qué hacer en cada nueva migración

Cuando hay un cambio de schema en desarrollo:

```bash
# 1. Generar la migración local
npx prisma migrate dev --name <descripcion-del-cambio>

# 2. Commitear y pushear — Vercel hace el resto automáticamente
git add prisma/
git commit -m "feat: <descripcion>"
git push
```

Vercel aplica la migración en producción durante el build. No hace falta intervención manual
si el build command y el usuario de migraciones están configurados correctamente.

### 8.5 Verificar que la migración se aplicó en producción

En EC2 vía `sudo mysql`:

```sql
USE novahold;

SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY started_at DESC
LIMIT 5;
-- La migración más reciente debe tener finished_at con fecha y applied_steps_count = 1
```

---

## Parte 9 — Crear la base de datos desde cero

Para cuando la DB está completamente vacía: instancia nueva, DB reseteada, o cambio de servidor.

### 9.1 Crear la DB y los usuarios (en EC2 vía `sudo mysql`)

```sql
-- Limpiar si existía algo anterior
DROP DATABASE IF EXISTS novahold;

-- Crear DB
CREATE DATABASE novahold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- Usuario de la app (con mTLS)
CREATE USER 'novahold_app'@'%'
  IDENTIFIED BY '<contraseña-32chars>'
  REQUIRE X509;

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_app'@'%';

-- Usuario de migraciones (sin X509 — para Vercel build)
CREATE USER 'novahold_migrate'@'%'
  IDENTIFIED BY '<contraseña-distinta-32chars>';

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_migrate'@'%';

-- Usuario local para TablePlus vía SSH tunnel (sin X509)
CREATE USER 'novahold_admin'@'127.0.0.1' IDENTIFIED BY '<otra-contraseña>';
GRANT ALL ON novahold.* TO 'novahold_admin'@'127.0.0.1';

FLUSH PRIVILEGES;
```

### 9.2 Aplicar todas las migraciones

La DB está vacía — no tiene tablas ni la tabla `_prisma_migrations`. Al hacer deploy,
`prisma migrate deploy` detecta que no hay historial y aplica todas las migraciones desde
cero en orden.

```bash
# Desde tu máquina local — push para disparar el deploy
git commit --allow-empty -m "chore: deploy on fresh db"
git push
```

Vercel corre `prisma migrate deploy` → crea todas las tablas → registra cada migración.

### 9.3 Verificar que todo quedó bien

```sql
USE novahold;

-- Ver todas las tablas creadas
SHOW TABLES;

-- Ver el historial de migraciones
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY started_at;
-- Todas deben tener finished_at con fecha y applied_steps_count = 1
```

### 9.4 Crear el usuario inicial

```sql
USE novahold;

INSERT INTO users (id, email, name, role, createdAt, updatedAt)
VALUES (
  UUID(),
  'usuario.real@novahold.com',
  'Nombre Admin',
  'SUPER_ADMIN',
  NOW(), NOW()
);
```

El email debe existir en el tenant Azure AD. Ver **Parte 4** para más opciones.

---

## Parte 10 — Troubleshooting: Migraciones fallidas (P3009)

### ¿Qué es P3009?

Prisma bloquea todos los deploys si detecta una migración marcada como fallida en
`_prisma_migrations`. El error en el build log de Vercel es:

```
Error: P3009
migrate found failed migrations in the target database,
new migrations will not be applied.
```

Mientras este error exista, **ningún deploy va a pasar**. Hay que resolverlo directamente
en la DB desde la EC2.

### Diagnóstico — en EC2 vía `sudo mysql`

```sql
USE novahold;

SELECT migration_name, finished_at, applied_steps_count, rolled_back_at
FROM _prisma_migrations
ORDER BY started_at;
```

Una migración fallida tiene: `finished_at = NULL` y `applied_steps_count = 0`.

### Paso 1 — Verificar si el cambio se aplicó realmente

Para una migración de índice:
```sql
SHOW INDEX FROM <tabla> WHERE Key_name = '<nombre_indice>';
-- Vacío = el cambio NO existe en la DB
-- Con resultado = el cambio SÍ existe en la DB
```

Para una migración de tabla o columna:
```sql
SHOW TABLES LIKE '<nombre_tabla>';
SHOW COLUMNS FROM <tabla> LIKE '<nombre_columna>';
```

### Paso 2a — El cambio NO existe: aplicarlo y marcar como aplicado

```sql
-- Aplicar el cambio manualmente (ejemplo: índice)
CREATE INDEX <nombre_indice> ON <tabla>(<columna>);

-- Marcar la migración como aplicada
UPDATE _prisma_migrations
SET finished_at = NOW(3), applied_steps_count = 1, logs = NULL, rolled_back_at = NULL
WHERE migration_name = '<nombre_exacto_de_la_migracion>';
```

### Paso 2b — El cambio SÍ existe: solo marcar como aplicado

```sql
UPDATE _prisma_migrations
SET finished_at = NOW(3), applied_steps_count = 1, logs = NULL, rolled_back_at = NULL
WHERE migration_name = '<nombre_exacto_de_la_migracion>';
```

### Paso 3 — Verificar que quedó limpio

```sql
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY started_at;
-- Todas las filas deben tener finished_at con fecha y applied_steps_count = 1
```

### Paso 4 — Redeploy en Vercel

Dashboard → Deployments → último deploy fallido → **Redeploy**.
No hace falta un nuevo push.

### Resumen del flujo de troubleshooting

```
Build Vercel falla con P3009
         │
         ▼
SSH a EC2 → sudo mysql → USE novahold
         │
         ▼
Verificar qué migración tiene finished_at = NULL
         │
         ├── El cambio NO existe en DB → aplicarlo manualmente → UPDATE _prisma_migrations
         │
         └── El cambio SÍ existe en DB → UPDATE _prisma_migrations directamente
         │
         ▼
Redeploy en Vercel → build pasa
```

---

## Parte 11 — Historial completo de la base de datos

Esta sección documenta todos los cambios aplicados a la DB desde el inicio del proyecto,
en orden cronológico. Sirve como referencia para entender el estado actual y para reconstruir
la DB desde cero si fuera necesario.

> **Para crear la DB desde cero no hace falta correr estos comandos manualmente.**
> `prisma migrate deploy` en el build de Vercel los aplica todos en orden automáticamente.
> Esta sección es solo referencia de QUÉ existe y POR QUÉ.

---

### Migración 1 — `20260421130232_init`
**Fecha**: 21 de abril de 2026
**Tipo**: Schema inicial completo
**Cómo se aplicó**: `prisma migrate deploy` en el primer deploy de Vercel

Crea las **18 tablas** del ERP y todas sus relaciones:

#### Auth (NextAuth v5 + Azure AD)
| Tabla | Propósito |
|-------|-----------|
| `users` | Usuarios del sistema con rol RBAC (`SUPER_ADMIN` → `VIEWER`) |
| `accounts` | Cuentas OAuth vinculadas (Azure AD) |
| `sessions` | Sesiones activas (usada con strategy `database`) |
| `verification_tokens` | Tokens de verificación de email |

#### Localización
| Tabla | Propósito |
|-------|-----------|
| `countries` | Países |
| `cities` | Ciudades → pertenecen a un país |
| `locations` | Sedes/oficinas → pertenecen a una ciudad |
| `bodegas` | Bodegas/almacenes → pertenecen a una sede |

#### Organización
| Tabla | Propósito |
|-------|-----------|
| `departments` | Departamentos de la empresa |
| `employees` | Empleados con ciudad, sede y departamento asignados |

#### Financiero
| Tabla | Propósito |
|-------|-----------|
| `currencies` | Monedas (COP base, USD, etc.) |
| `exchange_rates` | Tasas de cambio históricas por moneda |

#### Inventario de Activos
| Tabla | Propósito |
|-------|-----------|
| `categories` | Categorías de activos con prefijo y configuración de campos |
| `assets` | Tabla única de activos físicos — laptops, celulares, monitores, etc. |
| `assignments` | Asignaciones de activos a empleados (activa / devuelta / transferida) |
| `depreciation_snapshots` | Snapshots anuales de depreciación contable |

#### Operaciones
| Tabla | Propósito |
|-------|-----------|
| `maintenances` | Registros de mantenimiento por activo |
| `audit_logs` | Log inmutable de cambios en entidades del sistema |
| `asset_movements` | Kardex de movimientos físicos de activos entre sedes/bodegas |
| `import_logs` | Historial de importaciones masivas vía Excel |

#### Índices creados en esta migración
```
users_email_key                              (único)
users_employeeId_key                         (único)
accounts_provider_providerAccountId_key      (único)
sessions_sessionToken_key                    (único)
countries_name_key / countries_code_key      (únicos)
cities_name_countryId_key                    (único compuesto)
departments_name_key                         (único)
employees_email_key                          (único)
currencies_code_key                          (único)
exchange_rates_currencyId_effectiveDate_idx  (compuesto)
categories_name_key / categories_prefix_key  (únicos)
assets_assetCode_key / assets_serialNumber_key (únicos)
depreciation_snapshots_assetId_snapshotDate_idx (compuesto)
audit_logs_entityId_entity_idx               (compuesto)
audit_logs_assetId_idx
audit_logs_userId_idx
asset_movements_assetId_idx
asset_movements_toLocationId_idx
asset_movements_movedAt_idx
```

---

### Migración 2 — `20260606000001_add_audit_log_created_at_index`
**Fecha**: 6 de junio de 2026
**Tipo**: Índice de performance
**Cómo se aplicó**: Manually via `UPDATE _prisma_migrations` en EC2 + `CREATE INDEX` directo
(el `prisma migrate deploy` en Vercel falló por REQUIRE X509 — ver Parte 10)

```sql
CREATE INDEX IF NOT EXISTS `audit_logs_createdAt_idx` ON `audit_logs`(`createdAt`);
```

**Por qué**: El visor de audit logs pagina por `createdAt DESC`. Sin índice, cada consulta
hacía un full scan de la tabla. A medida que la tabla crece con los registros de auditoría
de todas las entidades, este índice es crítico para mantener la performance.

**Contexto**: Esta migración fue parte del cambio `full-audit-log` que expandió el sistema
de auditoría para cubrir todas las entidades del ERP (ver siguiente sección).

---

### Cambio de comportamiento — `full-audit-log` (6 de junio de 2026)
**Tipo**: Cambio de código — NO requirió migración de schema
**Cómo se aplicó**: Deploy normal de Vercel

Este cambio **no modificó el schema** pero sí cambió radicalmente qué se escribe en
`audit_logs`. Antes: solo los movimientos entre bodegas. Después: todas las mutaciones
del ERP.

#### Qué entidades ahora escriben en `audit_logs`

| Entidad | Operaciones auditadas | Acción registrada |
|---------|----------------------|-------------------|
| `assets` | crear, editar, desactivar, eliminar | `CREATE` / `UPDATE` / `DEACTIVATE` / `DELETE` |
| `assignments` | asignar, devolver, transferir, eliminar | `CREATE` / `RETURNED` / `TRANSFERRED` / `DELETE` |
| `employees` | crear, editar, desactivar, eliminar | `CREATE` / `UPDATE` / `DEACTIVATE` / `DELETE` |
| `maintenances` | crear, editar, eliminar | `CREATE` / `UPDATE` / `DELETE` |
| `users` | cambio de rol | `ROLE_CHANGED` |
| `asset_movements` | crear movimiento | `MOVED` (ya existía, ahora completo con ip/userAgent) |

#### Campos que ahora se populan correctamente
Antes de este cambio, `ip` y `userAgent` en `audit_logs` eran siempre `NULL`.
Ahora se capturan en cada operación via `headers()` de Next.js.

#### Helper centralizado
Toda escritura al audit log pasa por `src/lib/audit.ts` — nunca directamente con
`prisma.auditLog.create`. Esto garantiza consistencia y evita que futuras features
olviden registrar el audit.

---

### Estado actual de la DB (junio 2026)

```
18 tablas
21 índices (incluyendo audit_logs_createdAt_idx)
2 migraciones aplicadas
Audit log activo en 6 entidades / 16 tipos de operación
```

### Verificar estado completo desde MySQL (EC2)

```sql
USE novahold;

-- Ver todas las tablas
SHOW TABLES;

-- Ver migraciones aplicadas
SELECT migration_name, finished_at, applied_steps_count
FROM _prisma_migrations
ORDER BY started_at;

-- Ver índices de audit_logs
SHOW INDEX FROM audit_logs;

-- Verificar que el audit log está recibiendo datos
SELECT entity, action, COUNT(*) as total
FROM audit_logs
GROUP BY entity, action
ORDER BY entity, action;
```
