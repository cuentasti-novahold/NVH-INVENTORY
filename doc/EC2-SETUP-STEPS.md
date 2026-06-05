# EC2 MySQL Setup — Pasos ejecutados

## 1. Lanzar la instancia EC2

| Campo | Valor |
|-------|-------|
| AMI | Ubuntu Server 26.04 LTS |
| Instance type | t3.small |
| Storage | 30 GiB gp3 |
| Key pair | `purebasnova.pem` (guardar en `~/Downloads/`) |

**Security Group al lanzar:**
- SSH puerto 22 → Mi IP
- MySQL/Aurora puerto 3306 → `0.0.0.0/0`

> Si el wizard simplificado no muestra el botón de regla custom, lanzar con solo SSH y agregar MySQL después en EC2 → Security Groups → Inbound rules.

---

## 2. Asignar Elastic IP

1. EC2 → Red y seguridad → Direcciones IP elásticas
2. Asignar dirección IP elástica → Asignar
3. Seleccionar la IP → Acciones → Asociar dirección IP elástica → elegir la instancia

> Sin Elastic IP la IP pública cambia cada vez que se reinicia la instancia.

---

## 3. Conectarse por SSH

```bash
chmod 400 ~/Downloads/purebasnova.pem
ssh -i ~/Downloads/purebasnova.pem ubuntu@<ELASTIC_IP>
```

---

## 4. Instalar MySQL 8

```bash
sudo apt update && sudo apt install -y mysql-server
```

### Configuración segura

```bash
sudo mysql_secure_installation
```

| Pregunta | Respuesta |
|----------|-----------|
| Validate password component | No |
| Remove anonymous users | Yes |
| Disallow root login remotely | Yes |
| Remove test database | Yes |
| Reload privilege tables | Yes |

---

## 5. Configurar MySQL para producción

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

Cambiar/agregar estas líneas:

```ini
bind-address             = 0.0.0.0
mysqlx-bind-address      = 0.0.0.0
max_connections          = 200
local_infile             = 0
skip-name-resolve
```

> **NO agregar `require_secure_transport = ON`** — Prisma migrate deploy no soporta SSL en MySQL 8.4 con `caching_sha2_password` (plugin por defecto). Dejarlo OFF permite que las migraciones funcionen. La app en runtime igual usa SSL via el adapter en `prisma.ts`.

---

## 6. Generar certificados mTLS

```bash
mkdir -p ~/certs && cd ~/certs

# CA privada
openssl genrsa 2048 > ca-key.pem
openssl req -new -x509 -nodes -days 3650 -key ca-key.pem -out ca-cert.pem \
  -subj "/CN=novahold-ca"

# Certificado del servidor MySQL
openssl req -newkey rsa:2048 -nodes -keyout server-key.pem -out server-req.pem \
  -subj "/CN=novahold-db-server"
openssl x509 -req -days 3650 -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 01 -in server-req.pem -out server-cert.pem

# Certificado del cliente (la app en Vercel)
openssl req -newkey rsa:2048 -nodes -keyout client-key.pem -out client-req.pem \
  -subj "/CN=novahold-app-client"
openssl x509 -req -days 3650 -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 02 -in client-req.pem -out client-cert.pem
```

### Copiar certs del servidor a MySQL

```bash
sudo mkdir -p /etc/mysql/ssl
sudo cp ~/certs/ca-cert.pem     /etc/mysql/ssl/ca-cert.pem
sudo cp ~/certs/server-cert.pem /etc/mysql/ssl/server-cert.pem
sudo cp ~/certs/server-key.pem  /etc/mysql/ssl/server-key.pem
sudo chown -R mysql:mysql /etc/mysql/ssl/
sudo chmod 640 /etc/mysql/ssl/*.pem
```

### Apuntar MySQL a los certs — agregar al final de mysqld.cnf

```bash
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf
```

```ini
ssl-ca   = /etc/mysql/ssl/ca-cert.pem
ssl-cert = /etc/mysql/ssl/server-cert.pem
ssl-key  = /etc/mysql/ssl/server-key.pem
```

### Reiniciar y verificar

```bash
sudo systemctl restart mysql
sudo mysql -e "SHOW VARIABLES LIKE '%ssl%';"
# ssl_ca, ssl_cert, ssl_key deben mostrar las rutas
```

---

## 7. Crear base de datos y usuario

```bash
sudo mysql
```

```sql
CREATE DATABASE novahold CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE USER 'novahold_app'@'%'
  IDENTIFIED BY '<contraseña-sin-caracteres-especiales>';

GRANT SELECT, INSERT, UPDATE, DELETE,
      CREATE, ALTER, DROP, INDEX, REFERENCES
ON novahold.* TO 'novahold_app'@'%';

FLUSH PRIVILEGES;
exit
```

> **Importante — contraseña sin `@`, `#`, `?`, `&`**: estos caracteres son especiales en URLs. Si la contraseña los contiene, Prisma parsea mal la DATABASE_URL y falla con P1000. Usá solo letras, números y guiones.

> **MySQL 8.4 — `caching_sha2_password`**: es el plugin por defecto y no admite `mysql_native_password`. NO intentar cambiarlo. Funciona correctamente con `REQUIRE NONE` (sin cláusula REQUIRE).

### Verificar que el usuario puede conectarse

```bash
mysql -h 127.0.0.1 -u novahold_app -p'<contraseña>' novahold
```

Debe entrar sin errores. Si sale `Access denied`, verificar con:

```bash
sudo mysql -e "SHOW CREATE USER 'novahold_app'@'%';"
```

Si muestra `REQUIRE X509` o `REQUIRE SSL`, quitarlo:

```bash
sudo mysql -e "ALTER USER 'novahold_app'@'%' REQUIRE NONE; FLUSH PRIVILEGES;"
```

---

## 8. Copiar certs del cliente a la Mac local

Desde una **terminal en tu Mac** (no desde la sesión SSH):

```bash
scp -i ~/Downloads/purebasnova.pem ubuntu@<ELASTIC_IP>:~/certs/ca-cert.pem ~/Downloads/
scp -i ~/Downloads/purebasnova.pem ubuntu@<ELASTIC_IP>:~/certs/client-cert.pem ~/Downloads/
scp -i ~/Downloads/purebasnova.pem ubuntu@<ELASTIC_IP>:~/certs/client-key.pem ~/Downloads/
```

---

## 9. Correr migraciones manualmente (primera vez)

Desde tu Mac, antes del primer deploy:

```bash
cd /ruta/al/proyecto
DATABASE_URL='mysql://novahold_app:<contraseña>@<ELASTIC_IP>:3306/novahold' npx prisma migrate deploy
```

Debe mostrar `All migrations have been successfully applied.`

> En deploys posteriores, si hay cambios de schema: correr `npx prisma migrate dev --name <nombre>` localmente para generar la migración, hacer push, y Vercel aplica el migrate automáticamente en el build.

---

## 10. Variables de entorno en Vercel

Dashboard → Settings → Environment Variables → Production

| Variable | Valor |
|----------|-------|
| `DATABASE_URL` | `mysql://novahold_app:<PW>@<ELASTIC_IP>:3306/novahold` |
| `DB_SSL_CA` | contenido completo de `ca-cert.pem` |
| `DB_SSL_CERT` | contenido completo de `client-cert.pem` |
| `DB_SSL_KEY` | contenido completo de `client-key.pem` |

Para obtener el contenido de cada cert:

```bash
cat ~/Downloads/ca-cert.pem
cat ~/Downloads/client-cert.pem
cat ~/Downloads/client-key.pem
```

Pegar el texto completo incluyendo `-----BEGIN CERTIFICATE-----` y `-----END CERTIFICATE-----`.

---

## 11. Conectarse con TablePlus (SSH Tunnel — recomendado)

Es la forma más simple: no necesita los certs mTLS, usa la clave SSH que ya tenés.

### Pestaña Connection

| Campo | Valor |
|-------|-------|
| Host | `127.0.0.1` |
| Port | `3306` |
| User | `novahold_app` |
| Password | `<contraseña-32chars>` |
| Database | `novahold` |

### Pestaña SSH

| Campo | Valor |
|-------|-------|
| SSH Host | `<ELASTIC_IP>` |
| SSH Port | `22` |
| SSH User | `ubuntu` |
| SSH Key | `~/Downloads/purebasnova.pem` |

Hacer clic en **Test** — debe mostrar conexión exitosa.

---

## Checklist final

- [ ] Elastic IP asignada y asociada a la instancia
- [ ] Security Group: SSH (tu IP) + MySQL 3306 (0.0.0.0/0)
- [ ] MySQL corriendo con SSL activo (`ssl_ca`, `ssl_cert`, `ssl_key` con rutas)
- [ ] `require_secure_transport` — OFF (no agregarlo al config)
- [ ] Base de datos `novahold` creada
- [ ] Usuario `novahold_app` creado sin `REQUIRE X509` ni `REQUIRE SSL`
- [ ] Contraseña sin caracteres especiales (`@`, `#`, `?`, `&`)
- [ ] `mysql -h 127.0.0.1 -u novahold_app -p'<PW>' novahold` — entra sin errores
- [ ] `npx prisma migrate deploy` desde Mac — `All migrations applied`
- [ ] Certs `ca-cert.pem`, `client-cert.pem`, `client-key.pem` en `~/Downloads/`
- [ ] Variables de entorno cargadas en Vercel (DATABASE_URL + 3 certs)
- [ ] Build de Vercel pasa sin errores
- [ ] TablePlus conecta por SSH tunnel sin errores
