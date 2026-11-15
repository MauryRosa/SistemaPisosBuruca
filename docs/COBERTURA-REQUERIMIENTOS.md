# Cobertura de requisitos del sistema

Estado revisado contra la matriz `Vault_Pisos_Buruca/03 Requerimientos`. Esta lista describe el código fuente local; no equivale a evidencia de un despliegue ni a una prueba de aceptación.

## Requerimientos funcionales

| Requisito | Cobertura en el sistema |
|---|---|
| RF-01–05 | Catálogo de productos, tipo de producto, unidades, proveedor, mínimo y activación en `Catalogo.jsx` y `Proveedores.jsx`. |
| RF-06–08 | Ubicaciones configurables y existencias por ubicación en `Ubicaciones.jsx` y `ConsultaStock.jsx`. |
| RF-09 | Órdenes de pedido creadas por administración y ventas en `Pedidos.jsx`. |
| RF-10–12 | Recepción vinculada a OP y factura/remisión; comparación solicitado, recibido, faltante, sobrante y observación de daño; cantidades en cajas y piezas en `Entradas.jsx`. |
| RF-13–14 | Devolución vinculada a venta, cambios/garantías e inventario inicial en `Entradas.jsx`; validación de origen y acumulado en migraciones SQL. |
| RF-15–18 | Salidas con tipo, documento, responsable, fecha, comprobante único y metadatos en `Salidas.jsx` y `movimientos_transaccionales.sql`. |
| RF-19 | Traslados con emisión, estado en tránsito y confirmación de recepción en `Traslados.jsx`. |
| RF-20–24 | Mermas pendientes con evidencia y aprobación; consumo, exhibición, devolución a proveedor y cambio con entrada/salida atómicas en `Entradas.jsx`, `Salidas.jsx` y RPC. |
| RF-25 | Anulación con motivo, movimiento inverso y bloqueo de casos no reversibles en `anulaciones_y_apertura_caja.sql`. |
| RF-26–28 | Reservas, reducción del disponible, consumo al despachar y cancelación con motivo en `Reservas.jsx` y RPC. |
| RF-29 | Correlativos por serie y año, asignados en servidor. |
| RF-30–32 | Persona que retira, placa y evidencia; impresión/guardado en PDF; despacho desde minibodega en `Salidas.jsx`. |
| RF-33–35 | Captura de cajas y piezas, almacenamiento en unidad base y apertura de caja trazable sin modificar existencias en `Salidas.jsx`. |
| RF-36 | Físico, reservado y disponible por ubicación; la consulta invalida caché al recibir cambios de Realtime. |
| RF-37 | Conteo físico y aplicación de ajustes mediante aprobación administrativa en `Conteos.jsx`. |
| RF-38–39 | Reporte de salidas, kardex, movimientos, mermas y bajo mínimo; exportación CSV compatible con Excel en `Reportes.jsx`. |
| RF-40 | Inicio de sesión y permisos por rol en Auth, rutas protegidas y RLS. |
| RF-41 | Bitácora con usuario, acción, fecha y datos antes/después; lectura administrativa y sin mutaciones para usuarios autenticados. |

**Estado RF:** las funciones están representadas en el código y las migraciones locales. Falta aplicar y validar el conjunto completo contra una base Supabase desde cero y recorrer los flujos con cuentas de cada rol.

## Requerimientos no funcionales

| Requisito | Estado y evidencia necesaria |
|---|---|
| RNF-01–03 | Se implementan mediante restricciones, RPC transaccionales, permisos y anulaciones. Falta ejecutar la suite de base de datos contra PostgreSQL. |
| RNF-04 | La consulta de stock se suscribe a cambios de existencias y reservas. El requisito de menos de cinco segundos requiere medirlo en el entorno alojado. |
| RNF-05 | **Pendiente de acreditar:** hace falta una medición de menos de dos segundos con seis usuarios y datos representativos. |
| RNF-06 | Formularios directos y en español; el límite de un minuto y tres pantallas requiere prueba con personal de bodega. |
| RNF-07 | CSS adaptable, búsqueda por código/nombre y controles táctiles de 48 px implementados; falta revisión con dispositivos reales. |
| RNF-08–09 | **Dependen del entorno:** verificar disponibilidad durante horario de operación y conectividad en sala y bodega. |
| RNF-10 | En local: Supabase Auth y RLS, mínimo de 12 caracteres, JWT de 1 hora, sesión máxima de 24 horas e inactividad de 8 horas; el navegador cierra a los 30 minutos. **Pendiente en hosting:** no hay un proyecto Pisos Buruca conectado. Supabase ofrece los límites server-side de sesión solo en plan Pro; hay que confirmar el plan y aplicar los mismos ajustes alojados. |
| RNF-11 | **Pendiente de despliegue:** confirmar HTTPS en el dominio de producción. |
| RNF-12 | **Pendiente de operación:** activar respaldos diarios y conservar evidencia de restauración mensual. |
| RNF-13 | Las mutaciones de bitácora están bloqueadas para usuarios autenticados; la retención de cinco años exige configurar y verificar respaldos/retención en producción. |
| RNF-14 | Requiere revisión real de integrantes. No se atribuirán commits ni aprobaciones a quien no los haya realizado. |
| RNF-15 | **Pendiente de medir:** validar crecimiento y rendimiento con volumen representativo antes de afirmar escalabilidad. |
| RNF-16 | Exportación CSV implementada; no se incluye integración con facturación, según el alcance aprobado. |
| RNF-17 | Código basado en tecnologías abiertas; el costo total depende del proveedor y plan de despliegue elegidos. |

## Límites de esta revisión

- La regla de contingencia en papel se registra en los movimientos y reportes. La matriz enumera RF-01 a RF-41; no se inventó un RF-42.
- El usuario conectado no tiene un proyecto Supabase llamado Pisos Buruca disponible; no se aplicaron migraciones ni se desplegó la función.
- El entorno local no puede iniciar el contenedor de Postgres porque Podman no puede modificar su configuración de usuario.
- `pnpm lint` y `pnpm build` pasan en las cuatro ramas y en una copia temporal integrada con proveedores, ubicaciones, pedidos y movimientos. No se ejecutaron pruebas automatizadas.
- No hay evidencia actual de despliegue, respaldo/restauración, rendimiento bajo carga ni revisión por pares de estos cambios.
