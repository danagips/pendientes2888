# Pendientes Rent2888

Lista de pendientes del equipo. Cada persona entra con su nombre y su PIN, tilda lo que hizo y queda tachado con quién lo hizo y cuándo. La lista se actualiza sola cada 30 segundos.

## Quién tilda qué
| Área | Tilda |
|---|---|
| General, Compras, Dptos nuevos, Costa Rica, Liquidaciones | Todos |
| Nico / Tami / Vero | Solo esa persona |
| Cadetería, Mantenimiento | Vero, Tami y Nico |
| Todo, más editar y borrar | Dana, Nico y Brico |

Cualquiera puede agregar tareas. Los permisos están en `lib/pendientes/permisos.ts`.

## Instalación (una sola vez)
1. **Supabase** → SQL Editor → pegar `supabase/migrations/20261005_pendientes.sql` → Run (la carga inicial de tareas se pasa aparte, no está en el repo).
2. **Vercel** → Add New → Project → importar `danagips/pendientes-rent2888`.
3. Antes de Deploy, en Environment Variables cargar las de `.env.example`.
4. Deploy. Pasarle a cada uno su PIN por privado.

## Estructura
- `app/page.tsx`: la página.
- `app/api/pendientes/*`: sesión con PIN, listar, crear, tildar, editar, borrar.
- `lib/pendientes/permisos.ts`: permisos por área.
- `lib/pendientes/server.ts`: sesión (cookie firmada, 30 días) y cliente de Supabase (solo servidor).
- `supabase/migrations/`: la tabla.
