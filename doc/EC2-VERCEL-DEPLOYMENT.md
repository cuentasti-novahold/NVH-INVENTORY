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

### 1.1 `src/lib/prisma.ts` — Agregar SSL y connectionLimit

```ts
function createAdapter() {
  const url = new URL(process.env.DATABASE_URL ?? 'mysql://root:root@localhost:3306/novahold');
  return new PrismaMariaDb({
    host: url.hostname,
    port: Number(url.port) || 3306,
    user: url.username,
    password: url.password,
    database: url.pathname.slice(1),
    ssl: { rejectUnauthorized: false },   // TLS en tránsito
    connectionLimit: 3,                    // safe floor para serverless
    idleTimeout: 10,                       // cierra conexiones ociosas (seg)
  });
}
```

`rejectUnauthorized: false` acepta el cert auto-firmado de MySQL 8 (válido para esta etapa).
Si se agrega dominio + cert válido más adelante, cambiar a `true` + `ca: process.env.DB_SSL_CA`.

### 1.2 `prisma/seed.ts` — Misma corrección en el adapter del seed

El seed tiene su propio `createAdapter()`. Aplicar el mismo cambio de SSL allí para que
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
| MySQL/Aurora | 3306 | `0.0.0.0/0` | **Hobby plan no tiene IPs estáticas de egreso** |

> **Advertencia**: Abrir 3306 al mundo es la debilidad estructural del plan Hobby.
> La mitigación es por capas: usuario con contraseña fuerte (32+ chars), `REQUIRE SSL`,
> y `fail2ban`. El upgrade real es pasar a **Vercel Pro** (Secure Compute → IP estática → SG con `/32`).

### 2.3 Instalar MySQL 8

```bash
sudo apt update && sudo apt install -y mysql-server
sudo mysql_secure_installation
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

Verificar que MySQL 8 generó sus certs SSL automáticamente:

```bash
sudo ls /var/lib/mysql/*.pem
# debe mostrar: ca.pem, server-cert.pem, server-key.pem
```

Reiniciar: `sudo systemctl restart mysql`

### 2.5 Crear base de datos y usuario de aplicación

```sql
-- conectado como root
CREATE DATABASE novahold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'novahold_app'@'%' IDENTIFIED BY '<contraseña-32chars>'
  REQUIRE SSL;

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_app'@'%';

FLUSH PRIVILEGES;
```

Los permisos DDL (`CREATE/ALTER/DROP`) son necesarios para que `prisma migrate deploy`
pueda aplicar migraciones. Si se quiere separar en el futuro, crear un usuario solo-DDL
para el build y uno solo-DML para runtime.

---

## Parte 3 — Variables de entorno en Vercel

Dashboard → Settings → Environment Variables → Production

| Variable | Valor | Notas |
|----------|-------|-------|
| `DATABASE_URL` | `mysql://novahold_app:<PW>@<ELASTIC_IP>:3306/novahold` | Caracteres especiales en PW → percent-encode |
| `AZURE_AD_CLIENT_ID` | (del App Registration en Azure) | Exactamente este nombre — no `AUTH_AZURE_AD_ID` |
| `AZURE_AD_CLIENT_SECRET` | (del App Registration en Azure) | |
| `AZURE_AD_TENANT_ID` | (ID del tenant Azure AD) | |
| `AUTH_SECRET` | `openssl rand -base64 33` | Correr localmente, copiar el output |
| `NEXTAUTH_URL` | `https://<tu-app>.vercel.app` | Necesario para callbacks OAuth |

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

## Parte 5 — Checklist de validación post-deploy

- [ ] `curl https://<app>.vercel.app/api/health` → 200 OK
- [ ] Abrir `/login` → redirige a Microsoft login
- [ ] Ingresar con email `@novahold.com` → llega al dashboard
- [ ] Vercel Function Logs → sin errores de conexión MySQL
- [ ] MySQL EC2: `SHOW STATUS LIKE 'Ssl_cipher';` desde la conexión → muestra cipher activo
- [ ] MySQL EC2: `SHOW PROCESSLIST;` durante carga → connections < 20

---

## Escalación futura

| Trigger | Acción |
|---------|--------|
| Más de 20 conexiones concurrentes en MySQL | Instalar ProxySQL en la misma EC2 |
| Necesidad de IP fija en egreso | Upgradar a Vercel Pro → Secure Compute → lockear SG a `/32` |
| Cert SSL verificable | DNS para la EC2 + certbot → cambiar `rejectUnauthorized: true` |

---

## Archivos críticos a modificar

| Archivo | Cambio |
|---------|--------|
| `src/lib/prisma.ts` | Agregar `ssl`, `connectionLimit`, `idleTimeout` al adapter |
| `prisma/seed.ts` | Mismo cambio de SSL en su propio `createAdapter()` |
| `src/auth.config.ts` | Verificar/actualizar dominio guard si el tenant no es `@novahold.com` |
| Vercel Dashboard | Build Command + 6 env vars |
