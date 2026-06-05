# Vercel Production Setup — Checklist completo

Guía paso a paso para configurar nvh-inventory en Vercel con Azure AD, MySQL EC2 y SSL.

---

## Variables de entorno requeridas

Cargar en **Vercel → Settings → Environment Variables → Production**.

| Variable | Descripción | Ejemplo |
|----------|-------------|---------|
| `AUTH_SECRET` | JWT signing secret — generar con `openssl rand -base64 32` | `bu9m9Vh...` |
| `NEXTAUTH_URL` | URL pública de producción — **solo Production** | `https://nvh-inventory-beta.vercel.app` |
| `AZURE_AD_CLIENT_ID` | Application (client) ID del App Registration en Azure | `f047bfa0-...` |
| `AZURE_AD_CLIENT_SECRET` | Value del client secret (no el Secret ID) | `rbR8Q~...` |
| `AZURE_AD_TENANT_ID` | Directory (tenant) ID del tenant Azure | `2438af19-...` |
| `DATABASE_URL` | Conexión MySQL EC2 | `mysql://novahold_app:pass@13.216.x.x:3306/novahold` |
| `DB_SSL_CA` | Contenido completo de `ca-cert.pem` (con headers) | `-----BEGIN CERTIFICATE-----\n...` |
| `DB_SSL_CERT` | Contenido completo de `client-cert.pem` (con headers) | `-----BEGIN CERTIFICATE-----\n...` |
| `DB_SSL_KEY` | Contenido completo de `client-key.pem` (con headers) | `-----BEGIN PRIVATE KEY-----\n...` |
| `NEXT_PUBLIC_APP_URL` | URL pública de la app | `https://nvh-inventory-beta.vercel.app` |

> **IMPORTANTE**: `NEXTAUTH_URL` va **solo en Production**, no en Preview ni Development.

---

## Parte 1 — Generar AUTH_SECRET

```bash
openssl rand -base64 32
```

Copiar el output y cargarlo en Vercel como `AUTH_SECRET`.

---

## Parte 2 — Azure AD App Registration

Ver guía completa: `doc/AZURE-TENANT-SETUP.md`

Resumen de los pasos críticos:

1. **Microsoft Entra ID → App registrations → New registration**
   - Name: `novahold-inventory`
   - Supported account types: **Accounts in this organizational directory only**
   - Redirect URI (Web): `https://<tu-app>.vercel.app/api/auth/callback/microsoft-entra-id`

2. **Overview** → copiar:
   - `Application (client) ID` → `AZURE_AD_CLIENT_ID`
   - `Directory (tenant) ID` → `AZURE_AD_TENANT_ID`

3. **Certificates & secrets → New client secret**
   - Copiar el campo **Value** (no el Secret ID) → `AZURE_AD_CLIENT_SECRET`
   - Azure solo lo muestra una vez

4. **Authentication → Redirect URIs** → agregar también:
   ```
   http://localhost:3000/api/auth/callback/microsoft-entra-id
   ```

5. **API permissions** → verificar que estén los 4 permisos delegados:
   - `email`, `openid`, `profile`, `User.Read`

6. **Token configuration → Add optional claim → ID token** → agregar `email`

---

## Parte 3 — Certificados SSL (DB_SSL_CA, DB_SSL_CERT, DB_SSL_KEY)

Los certs se generan en EC2. Ver `doc/EC2-SETUP-STEPS.md` sección 6.

### Obtener el contenido desde EC2

```bash
ssh -i ~/Downloads/purebasnova.pem ubuntu@<ELASTIC_IP>
cat ~/certs/ca-cert.pem      # → DB_SSL_CA
cat ~/certs/client-cert.pem  # → DB_SSL_CERT
cat ~/certs/client-key.pem   # → DB_SSL_KEY
```

### Cargar en Vercel

En **Add Environment Variable**, pegar el contenido completo incluyendo las líneas de header y footer:

```
-----BEGIN CERTIFICATE-----
MIIDDTCCAfWg...
-----END CERTIFICATE-----
```

> **Pegar con saltos de línea reales** (no como una sola línea con `\n` literal).
> Vercel preserva los saltos de línea cuando se pega correctamente en el textarea.

---

## Parte 4 — DATABASE_URL

Formato:

```
mysql://USUARIO:PASSWORD@ELASTIC_IP_EC2:3306/NOMBRE_DB
```

Ejemplo:

```
mysql://novahold_app:NovaholdApp2026Prod@13.216.111.219:3306/novahold
```

> Usar la **Elastic IP** de EC2, no `localhost`.

---

## Parte 5 — Redeploy después de agregar variables

Agregar variables en Vercel **no redeploya automáticamente**. Siempre hacer:

**Deployments → deployment más reciente → `...` → Redeploy**

O pushear un commit nuevo.

---

## Problemas comunes y soluciones

| Error | Causa | Solución |
|-------|-------|----------|
| `AADSTS700016: Application not found` | `AZURE_AD_CLIENT_ID` tiene el Tenant ID en vez del Client ID | Corregir con el Application (client) ID del Overview |
| `AADSTS50011: Redirect URI mismatch` | La URL de Vercel deployment se usa en vez de la de producción | Agregar `NEXTAUTH_URL=https://<tu-app>.vercel.app` solo en Production |
| `error=Configuration` (500) | `AUTH_SECRET` no está cargada o el deployment es viejo | Agregar `AUTH_SECRET` y forzar Redeploy |
| `PEM routines: no start line` | Los certs en Vercel no tienen los headers `-----BEGIN...-----` | Re-pegar el contenido completo del PEM desde EC2 |
| `Hostname does not match certificate CN` | `DATABASE_URL` apunta a IP pero el cert tiene CN de hostname | `rejectUnauthorized: false` en `src/lib/prisma.ts` (ver nota abajo) |
| `JWTSessionError: Invalid Compact JWE` | Middleware usa JWT pero API usaba database sessions | Confirmado resuelto: `session: { strategy: 'jwt' }` en `src/auth.ts` |
| `pool timeout after 10001ms` | Certs SSL malformados o DB inaccesible | Verificar certs y que el Security Group de EC2 permite 3306 desde `0.0.0.0/0` |

---

## Nota sobre rejectUnauthorized

En `src/lib/prisma.ts`, `rejectUnauthorized: false` está activo porque el cert del servidor MySQL tiene `CN=novahold-db-server` pero la conexión va por IP (`13.216.x.x`).

La conexión sigue siendo **encriptada y autenticada por mTLS**. Solo se desactiva la verificación del hostname.

**Solución definitiva** (pendiente): regenerar el cert del servidor MySQL en EC2 con `subjectAltName=IP:13.216.x.x`:

```bash
# En EC2
openssl req -newkey rsa:2048 -nodes -keyout server-key.pem -out server-req.pem \
  -subj "/CN=novahold-db-server" \
  -addext "subjectAltName=IP:13.216.111.219"
openssl x509 -req -days 3650 -CA ca-cert.pem -CAkey ca-key.pem \
  -set_serial 02 -in server-req.pem -out server-cert.pem \
  -extfile <(echo "subjectAltName=IP:13.216.111.219")
```

Después de regenerar: subir el nuevo `ca-cert.pem` a Vercel y volver a `rejectUnauthorized: true`.

---

## Variables que NO son necesarias en Vercel

Si las tenés, eliminalas — son residuos de integraciones anteriores:

- `DATABASE_URL_PGUSER`, `DATABASE_URL_PGHOST`, `DATABASE_URL_POSTGRES_*`, `DATABASE_URL_NEON_*`, `DATABASE_URL_UNPOOLED` — todas las variables de Neon/PostgreSQL
- `NEXTAUTH_URL` en Preview/Development — solo va en Production
