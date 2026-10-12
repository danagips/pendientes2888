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

## Funciones
- **Deptos vinculados**: al escribir una tarea con el código o nombre del depto (Plamo, IT326, P3B, 4B…) se vincula sola. Los deptos y sus direcciones están en la tabla `deptos` de Supabase (no en el repo); para sumar uno nuevo, agregar una fila ahí.
- **Recorrido del día**: pestaña con las tareas de Cadetería y/o Mantenimiento agrupadas por dirección y ordenadas por zona, con links de Google Maps (hasta 9 paradas por link).
- **Antigüedad**: cada tarea muestra hace cuánto se cargó; las abiertas hace más de 7 días aparecen como *Estancadas*.
- **En espera**: quien puede tildar una tarea puede ponerla en espera (con el motivo) para sacarla de la lista activa.
- **Recurrentes**: cada semana o cada mes; al tildarla se crea sola la próxima.
- **Fotos**: quien puede tildar puede adjuntar fotos (se achican en el teléfono y se guardan en el bucket privado `pendientes`).

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
- `lib/pendientes/deptos.ts`: detección de deptos en el texto y orden del recorrido.
- `supabase/migrations/`: tablas, columnas y bucket de fotos.
