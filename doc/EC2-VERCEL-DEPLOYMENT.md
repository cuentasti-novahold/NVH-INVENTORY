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
