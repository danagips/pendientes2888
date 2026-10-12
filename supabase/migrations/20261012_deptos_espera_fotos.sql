-- Departamentos, tareas vinculadas a deptos, estado "esperando", recurrentes y fotos.

create table if not exists public.deptos (
  codigo     text primary key,
  alias      text[] not null default '{}',
  direccion  text not null,           -- calle y altura
  unidad     text,                    -- piso / depto
  barrio     text,
  tipo       text not null default 'depto' check (tipo in ('depto','edificio')),
  activo     boolean not null default true
);
alter table public.deptos enable row level security;

alter table public.pendientes
  add column if not exists deptos      text[] not null default '{}',
  add column if not exists esperando   text,
  add column if not exists recurrencia text check (recurrencia in ('semanal','mensual')),
  add column if not exists fotos       text[] not null default '{}';

create index if not exists pendientes_deptos_idx on public.pendientes using gin (deptos);

-- Bucket privado para las fotos de tareas terminadas (solo la API con service role accede).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pendientes', 'pendientes', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
