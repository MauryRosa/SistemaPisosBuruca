# Arquitectura de archivos

Sistema de Control de Inventario · Pisos Buruca
React 18 + JavaScript (Vite) · CSS puro con variables · Supabase (PostgreSQL, Auth, Realtime, Storage)

## Estructura

```
SistemaPisosBuruca/
├── index.html               Punto de entrada de Vite (lang="es", fuente Inter)
├── package.json             Dependencias y scripts (pnpm dev | build | lint | test)
├── vite.config.js           Configuración de Vite y Vitest
├── eslint.config.js         Reglas de estilo de código
├── .prettierrc              Formato de código
├── .env.example             Plantilla de variables (URL y clave PÚBLICA de Supabase)
├── .gitignore               Excluye node_modules, dist, .env y claves
├── README.md                Descripción, integrantes, beneficiario y cómo ejecutar
├── docs/
│   └── ARQUITECTURA.md      Este documento
├── public/
│   ├── favicon.svg
│   └── img/                 Imágenes estáticas (logo oficial, fotos)
├── src/
│   ├── main.jsx             Monta la app: estilos globales, TanStack Query y sesión
│   ├── App.jsx              Enrutador: /login y rutas protegidas por rol
│   ├── css/                 CSS puro, un archivo por responsabilidad
│   │   ├── variables.css    Tokens en :root (colores, tipografía, espaciado)
│   │   ├── reset.css        Reset mínimo
│   │   ├── base.css         Estilos del documento y utilidades
│   │   ├── components.css   Botones, campos, etiquetas, tarjetas, tablas, alertas
│   │   ├── layout.css       Menú lateral, barra superior y contenedor de páginas
│   │   └── <pantalla>.css   Estilos propios de cada pantalla (login, stock, dashboard…)
│   ├── components/
│   │   ├── layout/          AppLayout, Sidebar, Topbar, ProtectedRoute
│   │   └── ui/              Componentes reutilizables: Icon, Logo, StatusBadge, StatCard, EmptyState
│   ├── config/              Configuración de la interfaz (menú por rol)
│   ├── context/             Sesión del usuario: AuthProvider y hook useAuth
│   ├── hooks/               Consultas a Supabase con TanStack Query (useStock, useDashboard…)
│   ├── lib/                 Lógica sin interfaz: cliente Supabase, roles, cajas/piezas (+ pruebas)
│   └── pages/               Una pantalla por archivo: Login, ConsultaStock, Dashboard…
└── supabase/
    ├── config.toml          Configuración local (se genera con "supabase init")
    ├── migrations/          SQL versionado: tablas, vistas, funciones y RLS
    └── seed.sql             Datos de demostración solo para entorno local
```

## Capas y flujo de datos

```
pages/  →  hooks/  →  lib/supabase.js  →  Supabase (vistas + funciones + RLS)
  │          │
  │          └─ TanStack Query: caché, recarga y tiempo real
  └─ components/ui + css/
```

1. **Páginas** (`src/pages`) arman la pantalla con componentes de `components/ui` y estilos de `css/`.
2. **Hooks** (`src/hooks`) son la única capa que consulta datos; las páginas no llaman a Supabase directamente.
3. **lib/** contiene funciones puras y probadas (por ejemplo, `formatoStock` → “Cajas 10 · Piezas 21”).
4. **Base de datos**: toda la lógica de stock vive en PostgreSQL. El saldo solo cambia mediante un documento y su detalle; los permisos por rol se aplican con Row Level Security.

## Convenciones

| Tema | Convención |
|---|---|
| Componentes | `PascalCase.jsx`, un componente principal por archivo |
| Hooks | `useAlgo.js` en `src/hooks` |
| Utilidades | `camelCase.js` en `src/lib`, con su prueba `*.test.js` al lado |
| CSS | Solo variables de `variables.css`; clases en español con formato BEM (`bloque__elemento--modificador`) |
| Responsive | Móvil primero; `@media (min-width: 768px)` tableta y `@media (min-width: 1280px)` escritorio |
| Cantidades | Siempre en unidad base (piezas o unidades); se muestran como cajas + piezas, nunca m² |
| SQL | Una migración por cambio: `supabase/migrations/AAAAMMDDHHMMSS_descripcion.sql` |
| Commits | Conventional Commits en español: `feat(stock): …`, `fix(login): …`, `chore: …` |
| Secretos | Nunca en el repositorio; `.env` local con la clave pública únicamente |

## Pantallas y rutas

| Código | Ruta | Pantalla | Roles |
|---|---|---|---|
| P01 | `/login` | Inicio de sesión | Todos |
| P02 | — | Layout base (menú según rol) | Todos |
| P03 | `/stock` | Consulta de stock | Todos (inicio de la vendedora) |
| P14 | `/inicio` | Dashboard | Administrador, jefe de bodega |
| — | `/pedidos`, `/entradas`, `/salidas`, `/traslados`, `/reservas`, `/conteos` | Operación | Según rol |
| — | `/aprobaciones`, `/reportes`, `/bitacora` | Control | Administrador |
| — | `/catalogo`, `/proveedores`, `/ubicaciones`, `/usuarios` | Administración | Administrador |

> Las carpetas vacías contienen un archivo `.gitkeep` para que Git las conserve; se puede borrar cuando la carpeta ya tenga archivos.
