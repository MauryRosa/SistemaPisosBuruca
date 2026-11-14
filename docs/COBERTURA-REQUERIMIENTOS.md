# Cobertura y aceptación de requisitos

Contraste de la matriz `Vault_Pisos_Buruca/03 Requerimientos` con el código de esta rama. La columna de cobertura indica dónde está implementada cada regla; no sustituye las pruebas de aceptación descritas después.

La fuente oficial `RequerimientosDeSistema.pdf` fija 41 RF y 17 RNF. `Modelo de datos.md` menciona RF-42 para contingencias en papel, pero ese código no aparece en la lista funcional y `Reglas de negocio.md` lo marca como una regla sin RF. La aplicación permite marcar la digitalización de una contingencia; el plazo operativo de mismo día no forma parte de los 41 RF/RNF evaluados aquí.

## Requisitos funcionales

| Requisito | Implementación local |
|---|---|
| RF-01 | SKU, nombre, tipo, categoría, medida y proveedor en `Catalogo.jsx`; el proveedor es obligatorio en formulario y base (`20261114105838_requerir_proveedor_producto.sql`). |
| RF-02 | Pisos y accesorios, unidades base y empaque en `Catalogo.jsx`; restricciones de producto en `20261013000001_esquema_inicial.sql`. |
| RF-03 | Modo caja/pieza/ambos en catálogo; validación del despacho en `20261114105044_validar_modo_despacho.sql`. |
| RF-04 | Stock mínimo por producto, vista de bajo mínimo en dashboard y reporte. |
| RF-05 | Activación y desactivación de productos sin borrar; protección de productos con operaciones abiertas en `20261114105812_proteger_catalogo_con_historial.sql`. |
| RF-06 | Ubicaciones tipo bodega y minibodega, inicializadas para desarrollo en `supabase/seed.sql`. |
| RF-07 | Existencias por producto y ubicación; consulta en `v_stock`. |
| RF-08 | Altas de ubicaciones configurables en `Ubicaciones.jsx` y `useUbicaciones.js`. |
| RF-09 | Creación y cierre de órdenes por administración y ventas en `Pedidos.jsx`; el historial permite buscar y recorrer todas las órdenes. Correlativos y validación transaccional en `20261114105835_pedidos_con_correlativo.sql`. |
| RF-10 | Recepción ligada a la orden y al número de factura o remisión en `Entradas.jsx` y `registrar_movimiento_core`. |
| RF-11 | Cantidades solicitadas/recibidas, faltantes, sobrantes y observaciones en `Entradas.jsx`; la base exige observación al exceder la orden (`20261114124108_require_observation_for_purchase_overage.sql`). Las líneas de la orden y existencias iniciales recorren todas las páginas; productos y proveedores se consultan por lotes. |
| RF-12 | Captura de cajas y piezas convertida a unidad base en `Entradas.jsx` y `src/lib/unidades.js`. |
| RF-13 | Devolución ligada a una venta y cambio/garantía en `Entradas.jsx`; origen y cantidades acumuladas validados en `20261114105813_validar_devolucion_cliente.sql`. |
| RF-14 | Registro de inventario inicial por ubicación en `Entradas.jsx` y RPC transaccional. |
| RF-15 | Cada documento conserva tipo, serie/correlativo, fecha, creador y detalle en `documentos` y `detalle_documento`. |
| RF-16 | Salida por factura exige tipo y número en formulario y RPC. |
| RF-17 | Salida por recibo exige tipo y número en formulario y RPC. |
| RF-18 | Índice único conserva cada comprobante de salida incluso después de anularla (`20261114105839_conservar_unicidad_de_comprobantes.sql`). |
| RF-19 | Envío y confirmación de traslados con serie propia en `Traslados.jsx` y RPC. |
| RF-20 | Merma pendiente, carta privada obligatoria y aprobación administrativa en `Salidas.jsx`, `Aprobaciones.jsx` y RPC; la cola recupera todos los movimientos pendientes por páginas. |
| RF-21 | Consumo interno con motivo y salida trazable en `Salidas.jsx`. |
| RF-22 | Existencias de exhibición en una ubicación separada y no vendible; los traslados permiten esa ubicación. |
| RF-23 | Devolución a proveedor ligada a la recepción original y al documento del proveedor; la base valida producto, ubicación y cantidad acumulada frente a la recepción (`20261114140137_validar_devolucion_proveedor.sql`). |
| RF-24 | Cambio captura devolución y reemplazo dentro de una sola llamada transaccional. |
| RF-25 | Anulación con motivo y movimiento inverso; se pueden localizar todos los documentos anulables y los casos no reversibles se bloquean en `20261114105810_anulaciones_y_apertura_caja.sql`. |
| RF-26 | Jefatura de bodega crea reservas para una vendedora en `Reservas.jsx`; el historial y los catálogos asociados recuperan todos los registros por páginas y resuelven usuarios, productos y ubicaciones por lotes. |
| RF-27 | La vista de stock calcula disponible como físico menos reservas activas; `v_reservas_stock_activas` entrega solo totales a perfiles activos y mantiene privadas las filas de reservas. |
| RF-28 | Despacho consume la reserva coincidente; cancelación requiere motivo. |
| RF-29 | Correlativos de servidor por serie/año, iniciados en 00001, mediante `correlativos`. |
| RF-30 | Nombre de quien retira obligatorio; placa opcional cuando no hay vehículo (`Salidas.jsx` y `20261114131257_allow_dispatch_without_vehicle_plate.sql`); firma/foto privada y comprobante imprimible. |
| RF-31 | Vista de comprobante de salida preparada para imprimir o guardar como PDF desde el navegador; recupera todas las líneas y consulta productos y ubicaciones por lotes. |
| RF-32 | Despacho desde minibodega en formulario y RPC, que valida el tipo de ubicación. |
| RF-33 | Captura de cajas+piezas para pisos y unidad simple para accesorios en formularios de movimientos. |
| RF-34 | Persistencia en piezas/unidades base; muestra cajas completas y piezas totales, por ejemplo «10 cajas de 2 + 1 suelta: Cajas 10 · Piezas 21» (`src/lib/unidades.js`). La interfaz no muestra m². |
| RF-35 | Apertura de caja se registra como documento trazable sin modificar existencias. |
| RF-36 | Físico, reservado y disponible por ubicación en `ConsultaStock.jsx`; cambios de reservas envían una invalidación privada sin exponer sus filas. |
| RF-37 | Conteos totales o por categoría; catálogo y stock se cargan por páginas, y todos los conteos pendientes se recuperan para aprobación administrativa como documentos atómicos. El historial conserva los 100 más recientes. |
| RF-38 | Reporte de salidas por periodo en `Reportes.jsx`. |
| RF-39 | Kardex, movimientos, mermas y bajo mínimo; el reporte muestra todos los productos por páginas, resuelve sus catálogos por lotes y exporta el conjunto completo a CSV compatible con Excel. |
| RF-40 | Login, rutas protegidas, menú por rol, RLS y cuentas administradas en `AuthProvider.jsx`, `ProtectedRoute.jsx` y `Usuarios.jsx`; el catálogo de cuentas se pagina completo. |
| RF-41 | Triggers registran actor, acción, momento y antes/después; lectura administrativa, sin mutaciones por el rol de aplicación y exportación CSV de todo el rango y filtros seleccionados. |

**Estado de RF:** los 41 requisitos tienen implementación local identificada. No están aceptados operacionalmente hasta aplicar las migraciones desde cero y recorrer los flujos con usuarios de cada rol.

## Requisitos no funcionales

| Requisito | Implementación y estado de aceptación |
|---|---|
| RNF-01 | Los roles de aplicación no borran documentos ni bitácora; se corrige con anulaciones o ajustes. Requiere comprobar en PostgreSQL. |
| RNF-02 | Restricción no negativa y bloqueos de filas en las operaciones de stock. Requiere probar concurrencia en PostgreSQL. |
| RNF-03 | RPC transaccionales para movimientos, reservas, conteos, pedidos y anulaciones. Aplicación de migraciones pendiente. |
| RNF-04 | Realtime actualiza existencias por cambios de PostgreSQL y reservas mediante Broadcast privado para perfiles activos; falta medir el límite de cinco segundos en el entorno alojado. |
| RNF-05 | Pendiente: medir menos de dos segundos con seis usuarios y datos representativos. |
| RNF-06 | Flujos en español y formularios directos; falta cronometrar una salida con personal de bodega y confirmar el límite de tres pantallas. |
| RNF-07 | CSS adaptable, búsqueda por código/nombre y objetivos táctiles de 48 px; falta revisar en PC, celular y tablet reales. |
| RNF-08 | Pendiente de un despliegue y medición de disponibilidad durante horario de operación. |
| RNF-09 | Pendiente de probar conectividad desde sala de ventas y bodega. |
| RNF-10 | Auth, RLS, mínimo local de 12 caracteres y JWT de una hora; la marca persistente de actividad sincroniza pestañas y no se reinicia al restaurar o renovar sesión. Falta aplicar y revisar los límites de sesión en el proyecto alojado. |
| RNF-11 | HTTPS depende del dominio y despliegue final; no verificado. |
| RNF-12 | Pendiente configurar respaldos diarios y guardar evidencia de una restauración mensual. La organización Supabase actual está en Free; Pro ofrece respaldos diarios de la base con 7 días de retención, pero los objetos de Storage necesitan una copia aparte. |
| RNF-13 | Las mutaciones de bitácora están restringidas al rol de aplicación; la retención verificable de cinco años depende de respaldos y política operativa. |
| RNF-14 | Pendiente revisión real de compañeros en PR. Las autorías no se asignan a personas que no hayan hecho el trabajo. |
| RNF-15 | Stock, conteos, proveedores, usuarios, catálogos de entradas/pedidos/salidas/traslados/reportes, bajo mínimo, historial de reservas, órdenes, documentos anulables y colas de aprobación recorren resultados y líneas relacionadas por páginas o grupos. Pendiente medir crecimiento y rendimiento con volumen representativo; no hay evidencia para afirmar escalabilidad en producción. |
| RNF-16 | CSV implementado; integración con facturación queda fuera del alcance de esta versión. |
| RNF-17 | Código y dependencias de código abierto; falta elegir plan y documentar el costo operativo real. La organización actual usa Free y ya tiene sus dos proyectos activos; el proyecto de Pisos Buruca no existe. Pro inicia en USD 25/mes, sujeto al costo total de la organización. |

## Verificación realizada

- `npm run lint`: correcto.
- `npm run build`: correcto; Vite transformó 223 módulos.
- `git diff --check`: correcto.
- No se ejecutó la suite automatizada ni una base PostgreSQL: `supabase status` no pudo inspeccionar Podman porque no puede ajustar `/run/user/1000/libpod` (`read-only file system`).
- La lista Supabase consultada el 14/11/2026 mostró `Gnd Code` en Free con `SIA-U` y `UNIVO-Sistema-Contable` activos, sin proyecto Pisos Buruca. La cotización de creación devolvió USD 0/mes, pero no elimina el límite de dos proyectos del plan actual. No se aplicaron migraciones ni se desplegó Edge Function.
- La búsqueda del proyecto `Pisos Buruca` en la cuenta conectada de Vercel no encontró un proyecto ni despliegues asociados.
- La rama integrada sigue local y no se publicó en GitHub.
- `variablesDB.txt` está en el directorio padre del repositorio, con permisos `0600`, y no forma parte de Git; no se leyó su contenido. Los archivos `.env` están ignorados.

## Criterio de cierre

El código cubre los requisitos funcionales, pero el proyecto todavía no tiene evidencia suficiente para declararse aceptado al 100%. Para cerrar los RNF pendientes se requiere una instancia Supabase de Pisos Buruca, despliegue HTTPS, pruebas de aceptación y rendimiento, operación de respaldos/restauración y revisión real por compañeros.
