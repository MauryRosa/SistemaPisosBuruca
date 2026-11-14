# Pendientes y estado de despliegue

Fecha de corte: 14/11/2026. Este documento resume lo que **todavía no está hecho** aunque el código ya lo tenga. Complementa `docs/COBERTURA-REQUERIMIENTOS.md` y `docs/PUESTA-EN-MARCHA.md`.

## 1. Lo más importante: las migraciones NO están desplegadas en la base de datos alojada

Las 31 migraciones de `supabase/migrations/` solo se han aplicado en bases **locales de prueba** (Supabase CLI y contenedores). **Ninguna se ha aplicado todavía en el proyecto Supabase de Pisos Buruca**; hasta que se haga, la aplicación alojada no tendrá tablas, RLS, RPC ni el bucket de evidencias.

Orden y pasos:

1. Confirmar con el dueño de la cuenta cuál es el proyecto Supabase definitivo y quién tiene acceso (no está en la cuenta conectada a esta sesión).
2. Aplicar **todas** las migraciones en orden cronológico (de `20261013000001` a `20261114161000`), con `supabase link` + `supabase db push` o pegándolas una a una en el SQL Editor. Las dos últimas son nuevas de esta revisión:
   - `20261114160000_endurecer_permisos_y_apertura_caja.sql`
   - `20261114161000_aprobar_cambios_no_balanceados.sql`
3. **No** cargar `supabase/seed.sql` en producción (contiene cuentas demo con contraseña conocida). Crear el primer administrador a mano como indica `docs/PUESTA-EN-MARCHA.md`.
4. Desplegar la Edge Function `admin-usuarios` con `verify_jwt = true` y los secretos `AUTH_DOMAIN` (y opcionalmente `ALLOWED_ORIGIN`). Se probó la lógica, pero el runtime local de podman no logró arrancar la función, así que **falta probarla de punta a punta**.
5. Configurar Auth en el panel del proyecto alojado (`config.toml` solo rige el entorno local): registros desactivados, contraseña mínima de 12, `jwt_expiry` 3600, proveedor de correo activo, cambio de correo con confirmación, y que el esquema `private` **no** esté en los esquemas expuestos. Los límites de sesión (timebox e inactividad de 8 h) requieren el plan Pro.
6. Después de migrar, repetir la verificación manual por rol (administrador, jefe de bodega y vendedora) descrita en el informe de pruebas.

## 2. Infraestructura que aún no existe

- No hay despliegue del frontend ni dominio con HTTPS (RNF-11); la cuenta de Vercel conectada no tiene un proyecto de Pisos Buruca.
- Faltan cabeceras de seguridad y CSP en el hosting.
- Respaldos diarios automáticos y prueba mensual de restauración (RNF-12): sin configurar ni verificar. Los objetos de Storage (evidencias) necesitan copia aparte.
- No hay CI (lint, pruebas y build en cada PR).

## 3. Requisitos no funcionales sin medir (hace falta un entorno real)

RNF-04 (reflejo en menos de 5 s), RNF-05 (consultas en menos de 2 s con 6 usuarios), RNF-06 (una salida en 1 minuto y 3 pantallas), RNF-08 (disponibilidad en horario de operación) y RNF-09 (acceso desde sala y bodega). También falta evidencia de escalabilidad con volumen representativo (RNF-15) y confirmar el costo operativo (RNF-17).

## 4. Revisión entre compañeros (RNF-14)

El trabajo está dividido en ramas apiladas; cada una debe abrirse como pull request **en este orden**, cada una contra la anterior (o fusionando en secuencia contra `main`):

1. `chore/ignorar-pnpm-store`
2. `feat/seguridad-rls-evidencias`
3. `feat/movimientos-transaccionales`
4. `feat/usuarios-catalogo-detalle`
5. `feat/operaciones-bodega`
6. `feat/reportes-bitacora`
7. `feat/proveedores-ubicaciones-pedidos`
8. `fix/concurrencia-inventario`
9. `fix/despacho-y-seed-demo`
10. `fix/seguridad-sesion-entorno`
11. `perf/paginacion-stock-conteos`
12. `perf/paginacion-datos-completos`
13. `docs/trazabilidad-y-cierre`
14. `fix/login-local-supabase`
15. `fix/endurecimiento-auditoria`
16. `docs/pendientes-despliegue` (este documento)

Aún no hay revisiones de pull request de los compañeros.

## 5. Seguridad: auditoría parcial y decisiones abiertas

- Las auditorías (dos pasadas parciales) no encontraron vulnerabilidades confirmadas, pero **quedan 4 áreas sin revisar**: consultas de reportes, validaciones de los formularios de entradas y salidas frente al servidor, CORS y mensajes de error de la función Edge, y triggers de ciclo de vida (modo de despacho y conteo pendiente). No se ejecutó código dentro del protocolo de auditoría.
- Decisiones de negocio pendientes:
  - ¿`consumo_interno` debe pasar por aprobación o exigir evidencia? Hoy se aplica al instante.
  - Separación de funciones: el mismo administrador puede registrar y aprobar una merma.
  - Anular una recepción puede reabrir una orden que un administrador cerró a mano.
  - Una misma `evidencia_url` puede usarse en varios documentos.
  - `doc_venta_numero` de las reservas no se normaliza (un espacio al final impide el cruce con la venta).
  - Un conteo físico pendiente no se puede rechazar (solo aprobar); conviene un RPC `rechazar_conteo`.
  - Falta un chequeo AFTER de totales en devoluciones de cliente, como el de devoluciones a proveedor.
  - El `seed.sql` no tiene guarda que impida cargarlo fuera de local.

## 6. Verificación en navegador que falta

Se verificaron el administrador (15 pantallas, sin errores de consola) y la vendedora (permisos y RLS). **No se probó**: la cuenta de jefe de bodega, la subida de evidencias, el flujo completo de una salida con impresión, el diseño en celular y tableta, ni capturas visuales (las capturas de pantalla fallaron por tiempo de espera).

## 7. Autoría

Los commits están a nombre de quien los escribió; los seis compañeros figuran como coautores de forma equilibrada (`Co-authored-by`). Conviene que cada uno lo confirme antes de entregar el repositorio como evidencia de aportes.
