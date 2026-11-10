# Respaldos

Todos los días a las 03:17 (hora argentina), GitHub Actions copia la base de Supabase,
la cifra y la guarda 30 días. Lo hace el workflow `.github/workflows/respaldo.yml`.

## Ver que funciona

GitHub → pestaña **Actions** → **Respaldo diario**. Cada ejecución en verde tiene, abajo,
un archivo `respaldo-AAAA-MM-DD.tar.gz.gpg`. Con **Run workflow** se corre a mano.

## Restaurar (si algún día hace falta)

Desde una compu con `gpg` y PostgreSQL 17:

```bash
gpg -d respaldo-AAAA-MM-DD.tar.gz.gpg > respaldo.tar.gz   # pide RESPALDO_CLAVE
tar -xzf respaldo.tar.gz
# 1) usuarios primero, 2) después los datos de la app
pg_restore --data-only --no-owner -d "$SUPABASE_DB_URL" respaldo-*/usuarios.dump
pg_restore --clean --if-exists --no-owner -d "$SUPABASE_DB_URL" respaldo-*/public.dump
```

Para restaurar en un proyecto de Supabase nuevo conviene pedir ayuda: hay que volver a
crear la función `enviar-push` y la configuración de mails.
