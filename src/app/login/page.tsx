import { signIn, auth } from '@/auth';
import { redirect } from 'next/navigation';

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect('/');

  async function signInMicrosoft() {
    'use server';
    await signIn('microsoft-entra-id', { redirectTo: '/' });
  }

  async function signInDev() {
    'use server';
    await signIn('dev', { redirectTo: '/' });
  }

  const isDev = process.env.NODE_ENV === 'development';

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>

      {/* ── Left panel: brand identity ──────────────────────────── */}
      <div
        className="hidden lg:flex"
        style={{
          width: '50%',
          backgroundColor: '#00365f',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '3.5rem',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        {/* Dot grid — inventory catalog motif */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            inset: 0,
            backgroundImage:
              'radial-gradient(circle, rgba(255,255,255,0.07) 1.5px, transparent 1.5px)',
            backgroundSize: '28px 28px',
            pointerEvents: 'none',
          }}
        />
        {/* Teal ambient glow */}
        <div
          aria-hidden="true"
          style={{
            position: 'absolute',
            bottom: '-8rem',
            right: '-6rem',
            width: '28rem',
            height: '28rem',
            borderRadius: '9999px',
            background:
              'radial-gradient(circle, rgba(23,175,149,0.18) 0%, transparent 68%)',
            pointerEvents: 'none',
          }}
        />

        {/* Wordmark */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <div
              style={{
                width: '2rem',
                height: '2rem',
                borderRadius: '0.375rem',
                backgroundColor: '#17af95',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              {/* Grid icon — assets/inventory motif */}
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
                <rect x="0" y="0" width="5.5" height="5.5" rx="1" fill="white" fillOpacity="0.95" />
                <rect x="8.5" y="0" width="5.5" height="5.5" rx="1" fill="white" fillOpacity="0.55" />
                <rect x="0" y="8.5" width="5.5" height="5.5" rx="1" fill="white" fillOpacity="0.55" />
                <rect x="8.5" y="8.5" width="5.5" height="5.5" rx="1" fill="white" fillOpacity="0.25" />
              </svg>
            </div>
            <span
              style={{
                color: 'rgba(255,255,255,0.65)',
                fontSize: '0.8125rem',
                fontWeight: 500,
                letterSpacing: '0.04em',
              }}
            >
              Novahold
            </span>
          </div>
        </div>

        {/* Hero copy */}
        <div style={{ position: 'relative', zIndex: 10 }}>
          {/* Pill badge */}
          <div
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.375rem',
              padding: '0.25rem 0.75rem',
              borderRadius: '9999px',
              backgroundColor: 'rgba(23,175,149,0.12)',
              border: '1px solid rgba(23,175,149,0.22)',
              marginBottom: '1.25rem',
            }}
          >
            <span
              style={{
                width: '0.375rem',
                height: '0.375rem',
                borderRadius: '9999px',
                backgroundColor: '#17af95',
                display: 'inline-block',
              }}
            />
            <span
              style={{
                color: '#17af95',
                fontSize: '0.6875rem',
                fontWeight: 500,
                letterSpacing: '0.03em',
              }}
            >
              Sistema de Gestión de Activos IT
            </span>
          </div>

          <h2
            style={{
              color: 'white',
              fontSize: '2.375rem',
              fontWeight: 700,
              lineHeight: 1.18,
              letterSpacing: '-0.02em',
              marginBottom: '1rem',
            }}
          >
            Inventario que<br />responde en tiempo real
          </h2>
          <p
            style={{
              color: 'rgba(255,255,255,0.42)',
              fontSize: '0.875rem',
              lineHeight: 1.65,
              maxWidth: '22rem',
            }}
          >
            Trazabilidad completa del ciclo de vida de cada equipo — desde la adquisición hasta la baja.
          </p>
        </div>

        {/* Feature stats */}
        <div
          style={{
            position: 'relative',
            zIndex: 10,
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: '1.5rem',
            paddingTop: '1.5rem',
            borderTop: '1px solid rgba(255,255,255,0.08)',
          }}
        >
          {[
            { value: 'RBAC', label: 'Control de roles' },
            { value: 'QR', label: 'Tracking por código' },
            { value: 'XLSX', label: 'Importación masiva' },
          ].map(({ value, label }) => (
            <div key={value}>
              <div
                style={{
                  color: '#17af95',
                  fontSize: '0.9375rem',
                  fontWeight: 700,
                  letterSpacing: '0.02em',
                }}
              >
                {value}
              </div>
              <div
                style={{
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: '0.6875rem',
                  marginTop: '0.25rem',
                }}
              >
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel: auth form ───────────────────────────────── */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'white',
          padding: '3rem 2rem',
          position: 'relative',
        }}
      >
        {/* Mobile wordmark */}
        <div
          className="lg:hidden"
          style={{
            position: 'absolute',
            top: '2rem',
            left: '2rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <div
            style={{
              width: '1.75rem',
              height: '1.75rem',
              borderRadius: '0.25rem',
              backgroundColor: '#00365f',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              fontSize: '0.75rem',
              fontWeight: 700,
            }}
          >
            N
          </div>
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>
            Novahold Inventory
          </span>
        </div>

        {/* Form */}
        <div style={{ width: '100%', maxWidth: '22rem' }}>

          <div style={{ marginBottom: '2rem' }}>
            <h1
              style={{
                fontSize: '1.25rem',
                fontWeight: 600,
                color: '#111827',
                letterSpacing: '-0.01em',
                marginBottom: '0.375rem',
              }}
            >
              Acceso corporativo
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#6b7280', lineHeight: 1.55 }}>
              Iniciá sesión con tu cuenta{' '}
              <span style={{ fontWeight: 500, color: '#374151' }}>@novahold.com</span>{' '}
              de Microsoft.
            </p>
          </div>

          {/* Microsoft SSO button */}
          <form action={signInMicrosoft} style={{ marginBottom: '1.25rem' }}>
            <button
              type="submit"
              style={{
                width: '100%',
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.875rem 1rem',
                borderRadius: '0.5rem',
                border: '1px solid #e5e7eb',
                backgroundColor: 'white',
                cursor: 'pointer',
                boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
                fontSize: '0.875rem',
                fontWeight: 500,
                color: '#374151',
                transition: 'box-shadow 0.15s, border-color 0.15s',
              }}
            >
              {/* Microsoft 4-square logo */}
              <svg
                width="18"
                height="18"
                viewBox="0 0 21 21"
                aria-hidden="true"
                style={{ flexShrink: 0 }}
              >
                <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
              </svg>
              <span style={{ flex: 1, textAlign: 'center' }}>
                Continuar con Microsoft
              </span>
            </button>
          </form>

          {/* Security note */}
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.625rem',
              padding: '0.75rem 0.875rem',
              borderRadius: '0.375rem',
              backgroundColor: '#f7fffe',
              border: '1px solid rgba(23,175,149,0.2)',
              marginBottom: isDev ? '1.5rem' : 0,
            }}
          >
            {/* Shield icon */}
            <svg
              width="14"
              height="14"
              viewBox="0 0 16 16"
              fill="none"
              aria-hidden="true"
              style={{ flexShrink: 0, marginTop: '0.125rem' }}
            >
              <path
                d="M8 1.5L2 4v4c0 3.5 2.5 6.5 6 7.5 3.5-1 6-4 6-7.5V4L8 1.5z"
                fill="rgba(23,175,149,0.1)"
                stroke="#17af95"
                strokeWidth="1.2"
              />
              <path
                d="M5.5 8l2 2 3-3"
                stroke="#17af95"
                strokeWidth="1.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <p style={{ fontSize: '0.75rem', color: '#4b5563', lineHeight: 1.55 }}>
              El acceso está restringido a cuentas corporativas verificadas por{' '}
              <strong style={{ fontWeight: 500, color: '#374151' }}>Microsoft Entra ID</strong>.
            </p>
          </div>

          {/* Dev bypass */}
          {isDev && (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  marginBottom: '0.75rem',
                }}
              >
                <div style={{ flex: 1, height: '1px', backgroundColor: '#f3f4f6' }} />
                <span
                  style={{
                    fontSize: '0.6875rem',
                    color: '#9ca3af',
                    textTransform: 'uppercase',
                    letterSpacing: '0.08em',
                  }}
                >
                  Desarrollo
                </span>
                <div style={{ flex: 1, height: '1px', backgroundColor: '#f3f4f6' }} />
              </div>
              <form action={signInDev}>
                <button
                  type="submit"
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: '0.625rem 1rem',
                    borderRadius: '0.375rem',
                    border: '1px dashed #e5e7eb',
                    backgroundColor: 'transparent',
                    cursor: 'pointer',
                    fontSize: '0.75rem',
                    fontWeight: 500,
                    color: '#9ca3af',
                  }}
                >
                  Ingresar como dev (SUPER_ADMIN)
                </button>
              </form>
            </div>
          )}
        </div>

        {/* Footer */}
        <p
          style={{
            position: 'absolute',
            bottom: '1.5rem',
            fontSize: '0.6875rem',
            color: '#d1d5db',
            textAlign: 'center',
          }}
        >
          © {new Date().getFullYear()} Novahold · ERP de Inventario Corporativo
        </p>
      </div>
    </div>
  );
}
