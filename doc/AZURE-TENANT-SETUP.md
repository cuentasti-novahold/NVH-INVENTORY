# Azure AD (Microsoft Entra ID) — Configuración paso a paso

## Qué vas a obtener al final de esta guía

| Variable | Dónde se usa |
|----------|-------------|
| `AZURE_AD_CLIENT_ID` | Vercel env vars |
| `AZURE_AD_CLIENT_SECRET` | Vercel env vars |
| `AZURE_AD_TENANT_ID` | Vercel env vars |

Estas 3 variables son las que necesita NextAuth para autenticar usuarios via Microsoft.

---

## Requisitos previos

- Acceso al portal de Azure con una cuenta que tenga rol **Application Administrator**
  o superior en el tenant `@novahold.com`
- URL del portal: `https://portal.azure.com`

---

## Parte 1 — Registrar la aplicación

### 1.1 Ir a Microsoft Entra ID

1. Ingresar a `https://portal.azure.com`
2. En la barra de búsqueda superior escribir **Microsoft Entra ID**
3. Hacer clic en el resultado

### 1.2 Crear el App Registration

1. En el menú izquierdo → **App registrations**
2. Hacer clic en **+ New registration**
3. Completar el formulario:

| Campo | Valor |
|-------|-------|
| Name | `novahold-inventory` (o el nombre que prefieran) |
| Supported account types | **Accounts in this organizational directory only** (`@novahold.com` only) |
| Redirect URI (platform) | **Web** |
| Redirect URI (value) | `https://<tu-app>.vercel.app/api/auth/callback/microsoft-entra-id` |

> Si aún no tenés la URL de Vercel, dejá el Redirect URI vacío y lo completás en el paso 2.2.

4. Hacer clic en **Register**

---

## Parte 2 — Obtener las credenciales

### 2.1 Obtener `AZURE_AD_CLIENT_ID` y `AZURE_AD_TENANT_ID`

Después de registrar la app, Azure muestra la pantalla **Overview**. Ahí están los dos valores:

```
Application (client) ID  →  AZURE_AD_CLIENT_ID
Directory (tenant) ID    →  AZURE_AD_TENANT_ID
```

Copiarlos y guardarlos en un lugar seguro.

### 2.2 Crear el `AZURE_AD_CLIENT_SECRET`

1. En el menú izquierdo → **Certificates & secrets**
2. Pestaña **Client secrets** → **+ New client secret**
3. Completar:

| Campo | Valor |
|-------|-------|
| Description | `novahold-inventory-prod` |
| Expires | **24 months** (máximo disponible) |

4. Hacer clic en **Add**
5. **IMPORTANTE**: copiar el valor de la columna **Value** en ese momento.
   Azure solo lo muestra una vez. Si salís de la pantalla sin copiarlo, hay que generar uno nuevo.

```
Value  →  AZURE_AD_CLIENT_SECRET
```

> El campo **Secret ID** NO es el secret — es solo un identificador interno. El secreto es el **Value**.

---

## Parte 3 — Configurar los Redirect URIs

### 3.1 URIs requeridas

En el menú izquierdo → **Authentication** → sección **Web** → **Redirect URIs**

Agregar estas dos URIs:

```
https://<tu-app>.vercel.app/api/auth/callback/microsoft-entra-id
http://localhost:3000/api/auth/callback/microsoft-entra-id
```

La segunda es para desarrollo local. Sin ella, el login falla al correr `pnpm dev`.

### 3.2 Front-channel logout URL (opcional pero recomendado)

En la misma pantalla, campo **Front-channel logout URL**:

```
https://<tu-app>.vercel.app/api/auth/signout
```

### 3.3 Tokens (verificar configuración)

En la misma pantalla, sección **Implicit grant and hybrid flows**:

- ID tokens: **desactivado** (NextAuth v5 usa Authorization Code flow, no necesita esto)
- Access tokens: **desactivado**

Hacer clic en **Save**.

---

## Parte 4 — Configurar permisos de API

### 4.1 Permisos necesarios

En el menú izquierdo → **API permissions**

Verificar que estén estos permisos (son los que agrega Azure por defecto):

| API | Permission | Type |
|-----|-----------|------|
| Microsoft Graph | `email` | Delegated |
| Microsoft Graph | `openid` | Delegated |
| Microsoft Graph | `profile` | Delegated |
| Microsoft Graph | `User.Read` | Delegated |

Si falta alguno → **+ Add a permission** → **Microsoft Graph** → **Delegated permissions** → buscarlo y agregarlo.

### 4.2 Dar consentimiento de admin

Hacer clic en **Grant admin consent for novahold** → confirmar con **Yes**.

> Esto evita que cada usuario vea la pantalla de consentimiento al hacer login por primera vez.

---

## Parte 5 — Verificar la configuración del token

### 5.1 Token configuration

En el menú izquierdo → **Token configuration**

Verificar o agregar estos optional claims para el **ID token**:

| Claim | Por qué |
|-------|---------|
| `email` | NextAuth lo usa para identificar al usuario |
| `preferred_username` | Fallback si `email` no está presente |

Para agregar un claim:
1. **+ Add optional claim** → Token type: **ID**
2. Seleccionar `email` → **Add**
3. Si Azure pregunta si activar el permiso `email` de Microsoft Graph → aceptar

---

## Parte 6 — Verificar usuarios del tenant

Para que alguien pueda ingresar a la app necesita:
1. Tener una cuenta en el tenant `@novahold.com` en Azure AD
2. Tener un registro en la tabla `User` de la base de datos (ver `doc/EC2-VERCEL-DEPLOYMENT.md` Parte 4)

### 6.1 Ver usuarios existentes

En el menú principal de **Microsoft Entra ID** → **Users** → **All users**

Lista todos los usuarios del tenant. Verificar que los emails que van a usar la app estén presentes.

### 6.2 Crear un nuevo usuario en el tenant

Si necesitás crear el usuario administrador inicial:

1. **Users** → **+ New user** → **Create new user**
2. Completar:

| Campo | Valor |
|-------|-------|
| User principal name | `admin@novahold.com` |
| Display name | `Administrador Novahold` |
| Password | Auto-generate o definir uno (el usuario lo cambia en el primer login) |

3. En **Assignments** → agregar roles si se necesita (para la app no hace falta, el rol lo maneja la DB)
4. Hacer clic en **Create**

> Después de crear el usuario en Azure, crear también su registro en la DB con el rol correcto
> (ver Parte 4 — Opción C en `EC2-VERCEL-DEPLOYMENT.md`).

---

## Parte 7 — Resumen de variables para Vercel

Al terminar esta guía tenés los 3 valores. Cargarlos en Vercel:

**Dashboard → Settings → Environment Variables → Production**

```
AZURE_AD_CLIENT_ID     = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
AZURE_AD_CLIENT_SECRET = xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
AZURE_AD_TENANT_ID     = xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
```

> Usar exactamente estos nombres de variable. El código en `src/auth.config.ts` los lee
> con estos nombres. Si usás `AUTH_AZURE_AD_ID` o similar, el login no funciona.

---

## Parte 8 — Checklist de verificación

- [ ] App Registration creada con nombre `novahold-inventory`
- [ ] Supported account types: **this organization only**
- [ ] `AZURE_AD_CLIENT_ID` copiado desde Overview
- [ ] `AZURE_AD_TENANT_ID` copiado desde Overview
- [ ] Client secret creado y `AZURE_AD_CLIENT_SECRET` (Value) copiado antes de salir
- [ ] Redirect URI de producción agregada: `.../api/auth/callback/microsoft-entra-id`
- [ ] Redirect URI de localhost agregada para desarrollo
- [ ] Permisos `email`, `openid`, `profile`, `User.Read` presentes
- [ ] Admin consent otorgado
- [ ] Optional claim `email` configurado en Token configuration
- [ ] Usuario administrador existe en el tenant con email `@novahold.com`
- [ ] Las 3 variables cargadas en Vercel con los nombres exactos

---

## Problemas comunes

| Error | Causa | Solución |
|-------|-------|----------|
| `AADSTS50011: The redirect URI does not match` | La URI en Azure no coincide exactamente con la de producción | Verificar que no falte ni sobre ningún caracter en el Redirect URI |
| Login redirige a `/login` con error silencioso | El email no termina en `@novahold.com` | Verificar el dominio del tenant y el guard en `src/auth.config.ts` |
| `Client secret not found` | Se copió el Secret ID en vez del Value | Volver a Certificates & secrets, generar uno nuevo, copiar el Value |
| Usuario llega al dashboard pero sin permisos | El registro en la DB no tiene el rol correcto | Hacer UPDATE en la tabla `User` o correr el seed |
| Login funciona en dev pero falla en producción | Falta el Redirect URI de producción en Azure | Agregarlo en Authentication → Redirect URIs |
