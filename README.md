# Finanzas

Webapp instalable (PWA) para registrar ingresos, gastos, inversiones y gastos de grupo.
Cada usuario ve solo sus movimientos; la separación la impone la base de datos con Row Level Security.

**Stack:** React + TypeScript + Vite · Supabase (Postgres + Auth) · Vercel.

## Estado

- [x] Etapa 1 — Setup: login con email, perfil con consentimiento, app instalable.
- [ ] Etapa 2 — Personal básico: categorías, alta rápida, movimientos, resumen mensual.
- [ ] Etapa 3 — Tarjetas, cuotas, conciliación y USD (MEP de cierre).
- [ ] Etapa 4 — Grupos.
- [ ] Etapa 5 — Seguridad y legal: 2FA, Google, política final, exportar y borrar cuenta.
- [ ] Etapa 6 — Apertura a conocidos.

## Puesta en marcha (una sola vez)

### 1. Supabase

1. En [supabase.com](https://supabase.com) → **New project**.
   - Nombre: `app-finanzas`.
   - Database password: generá una larga y guardala en tu gestor de contraseñas. No hace falta compartirla.
   - Region: **Central EU (Frankfurt)** (Unión Europea, país adecuado según la Ley 25.326).
   - Plan: Free.
2. **SQL Editor** → New query → pegá el contenido de `supabase/migrations/0001_perfiles.sql` → **Run**.
3. **Project Settings → API**: copiá la **Project URL** y la clave pública (**anon public** o **Publishable key**).
   Nunca uses la `service_role` / secret key en la app.

### 2. Vercel

1. En [vercel.com](https://vercel.com) → **Add New → Project** → importá `app-finanzas`.
2. Framework: Vite (se detecta solo).
3. **Environment Variables**:
   - `VITE_SUPABASE_URL` = Project URL
   - `VITE_SUPABASE_ANON_KEY` = clave pública
4. **Deploy**. Anotá la URL que te da (ej. `app-finanzas-xxxx.vercel.app`).

### 3. Volver a Supabase

**Authentication → URL Configuration**:
- Site URL: la URL de Vercel.
- Redirect URLs: agregá la misma URL.

Así el link del email de confirmación vuelve a tu app.

## Desarrollo local

```bash
npm install
cp .env.example .env.local   # completar con los valores de Supabase
npm run dev
```

Los íconos se regeneran con `python3 scripts/make_icons.py`.

## Seguridad

- La clave pública de Supabase va en el frontend por diseño; lo que protege los datos son las políticas RLS de `supabase/migrations`.
- El service worker no cachea nada: no quedan datos financieros guardados en la caché del dispositivo.
- Vercel envía cabeceras de seguridad (HSTS, no-sniff, sin iframes); ver `vercel.json`.
