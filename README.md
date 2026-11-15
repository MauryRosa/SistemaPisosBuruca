# Sistema de Control de Inventario · Pisos Buruca

Aplicación web adaptable que registra cada entrada y salida de producto de la **bodega principal** y la **minibodega de la sala de ventas** de Pisos Buruca (San Miguel, El Salvador), para que la existencia registrada coincida con la física. Funciona en paralelo al sistema de facturación conectado a Hacienda, sin modificarlo.

Proyecto social **“Impulso Web Local”** · Diseño Web Adaptable · Universidad de Oriente · Ciclo 02-2026 · Docente: Ing. Alberto Turcios Ortez.

## Beneficiario
**Pisos Buruca** — venta de pisos, revestimientos y materiales de instalación. Sala de ventas: Av. Roosevelt, San Miguel. Bodega de despacho: Av. Nicaragua, San Miguel.

## Integrantes
| Integrante | Aporte principal |
|---|---|
| Mauricio Antonio Bustillo Rosales | Estructura del proyecto y configuración |
| Carlos Alberto Granados Amaya | Base de datos (migraciones, vistas y seguridad) |
| René Francisco Pacheco Araniva | Sistema de estilos (CSS) y componentes base |
| Lenin Alejandro Hernández Coreas | Conexión con Supabase, sesión y utilidades |
| Bremond Antony Hernández Coreas | Pantallas de inicio de sesión y dashboard |
| Kevin Bladimir Guardado Ortez | Layout base, menú por rol y rutas |
| Henry Fernando Portillo Luna | Consulta de stock |

## Tecnologías
React 18 + JavaScript (Vite), CSS propio con variables, React Router, TanStack Query, React Hook Form + Zod, Supabase (PostgreSQL, Auth, Realtime y Storage).

## Cómo ejecutar
```bash
pnpm install
cp .env.example .env   # completar con la URL, la clave pública y el dominio interno
pnpm dev               # http://localhost:5173
```

Para iniciar Supabase local, preparar el entorno alojado y revisar la lista previa a producción, consulta [Puesta en marcha](docs/PUESTA-EN-MARCHA.md). Lo que **falta** (migraciones sin desplegar en la base alojada, hosting, respaldos, mediciones y decisiones abiertas) está en [Pendientes](docs/PENDIENTES.md).
La matriz de cobertura funcional y no funcional está en [Cobertura de requisitos](docs/COBERTURA-REQUERIMIENTOS.md).

## Scripts
| Comando | Uso |
|---|---|
| `pnpm dev` | Servidor de desarrollo |
| `pnpm build` | Compilación de producción en `dist/` |
| `pnpm lint` | Revisión de estilo de código |
| `pnpm test` | Pruebas unitarias (Vitest) |

## Seguridad
El archivo `.env` está en `.gitignore`. El navegador usa la clave **publicable** de Supabase; la clave `service_role` solo se usa como secreto del entorno de Edge Functions y nunca se sube al repositorio.
