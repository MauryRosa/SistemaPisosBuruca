# Puesta en marcha

## Desarrollo local

1. Instala Node.js, pnpm y Supabase CLI. Docker o Podman debe estar disponible para levantar los servicios locales.
2. Copia `.env.example` como `.env` y configura la URL local, la clave pública y `VITE_AUTH_DOMAIN`. Copia `supabase/functions/.env.example` como `supabase/functions/.env` para que el runtime local de Edge Functions reciba `AUTH_DOMAIN`. Ambos dominios deben coincidir. Los dos archivos `.env` quedan ignorados por Git.
3. Inicia Supabase local con el flujo de desarrollo documentado por [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started). Después ejecuta `supabase db reset` para aplicar las migraciones y el seed.
4. El seed incluye datos y cuentas de demostración; **no debe cargarse en producción**.
   - Cuentas locales: `admin`, `bodega` y `vendedora1`; contraseña de demostración: `DemoPisos2026!`. No reutilices esa contraseña fuera del entorno local.
5. Instala dependencias y ejecuta `pnpm dev`.

La clave `service_role` solo se configura como secreto del entorno de Supabase. No se coloca en `.env` del frontend.

## Entorno alojado

El archivo `supabase/config.toml` configura el entorno local; no aplica por sí solo los ajustes de Auth de un proyecto alojado. Antes de una publicación:

1. Confirma el proyecto y su historial de migraciones; revisa los cambios antes de aplicar el esquema. Sigue la [guía oficial de migraciones](https://supabase.com/docs/guides/deployment/database-migrations).
2. Despliega `admin-usuarios` y configura `AUTH_DOMAIN` como secreto de la función. Usa el mismo dominio como `VITE_AUTH_DOMAIN` durante la compilación del frontend.
3. Configura Auth para desactivar el registro público, exigir contraseñas de al menos 12 caracteres y usar JWT de 1 hora. En el repositorio, `supabase/config.toml` fija además una sesión máxima de 24 horas y cierre tras 8 horas de inactividad; el navegador cierra a los 30 minutos. Supabase reserva los límites server-side de sesión para plan Pro. Confirma el plan alojado y aplica esos límites en Auth; si el proyecto no los admite, RNF-10 sigue pendiente.
4. Sirve la aplicación con HTTPS y configura `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` en el entorno de compilación. La clave publicable puede estar en el navegador; la clave `service_role` no.
5. Para iniciar el proyecto, crea la primera cuenta desde Authentication en el dashboard con el correo `<usuario>@AUTH_DOMAIN` y registra su perfil como administrador desde SQL Editor, usando el UUID que generó Supabase:

   ```sql
   insert into public.usuarios (id, nombre, usuario, rol, activo)
   values ('<UUID-DE-AUTH>', '<NOMBRE>', '<USUARIO>', 'administrador', true);
   ```

   Haz este paso una sola vez en el proyecto correcto y no guardes el UUID real ni credenciales en Git. Después, crea las demás cuentas desde Usuarios. No cargues las cuentas de demostración del seed en el proyecto alojado.
6. Configura respaldos diarios y conserva evidencia de una restauración mensual.

Referencias: [Auth sessions](https://supabase.com/docs/guides/auth/sessions), [despliegue de Edge Functions](https://supabase.com/docs/guides/functions/deploy), [gestión de secretos](https://supabase.com/docs/guides/functions/secrets) y [respaldos](https://supabase.com/docs/guides/platform/backups).

## Lista de cierre

- [ ] Aplicar las migraciones desde una base vacía y revisar permisos, funciones, Storage y Realtime.
- [ ] Ejecutar verificaciones de base de datos y los flujos de compra, recepción, venta, devolución, reserva, traslado, conteo y anulación.
- [ ] Medir las consultas con seis usuarios concurrentes y confirmar el objetivo de menos de dos segundos.
- [ ] Confirmar HTTPS, acceso desde sala y bodega, y disponibilidad durante el horario de operación.
- [ ] Verificar respaldos diarios y una restauración mensual.
- [ ] Obtener revisión real de otro integrante en GitHub antes de cerrar los PR.

`npm run lint` y `npm run build` pasan en la rama actual. Las casillas anteriores aún requieren una instancia Supabase accesible, un despliegue y revisión del equipo.

## Estado de Supabase consultado el 14/11/2026

- La cuenta Supabase conectada muestra la organización Gnd Code en Free, con dos proyectos activos (SIA-U y UNIVO-Sistema-Contable); Pisos Buruca no aparece en esa cuenta. El usuario indica que el proyecto existente está en otra cuenta, cuyo acceso y configuración aún no se verifican.
- La cotización de USD 0/mes aplica a crear un proyecto en Gnd Code; la organización ya alcanzó su límite Free de dos proyectos activos. Este dato no determina el costo ni el plan del proyecto que está en otra cuenta.
- La copia local revisada apunta VITE_SUPABASE_URL a 127.0.0.1; esa dirección corresponde al entorno local y no identifica el proyecto alojado. No se inspeccionaron claves del archivo .env.
- Pro cuesta USD 25/mes e incluye créditos para una instancia Micro y respaldos diarios de base de datos con siete días de retención. Los respaldos de base de datos no incluyen objetos de Storage; la evidencia de movimientos requiere un respaldo separado. Confirma el costo final de la organización antes de cambiar el plan o crear el proyecto.
- Fuentes: [precios de Supabase](https://supabase.com/pricing), [respaldos de base de datos](https://supabase.com/docs/guides/platform/backups).
