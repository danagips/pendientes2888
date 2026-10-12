-- Pendientes del equipo Rent2888
-- Solo la API del CRM (service role) lee y escribe: RLS activado sin políticas,
-- así la clave pública (anon) no puede ver ni tocar esta tabla.

create table if not exists public.pendientes (
  id          uuid primary key default gen_random_uuid(),
  area        text not null check (area in (
                'general','nico','tami','vero','cadeteria',
                'mantenimiento','compras','dptos_nuevos','costa_rica','liquidaciones')),
  texto       text not null check (char_length(texto) between 1 and 500),
  detalle     text,                       -- subgrupo opcional: "Meco", "Emila", "Septiembre"...
  prioridad   text not null default 'normal' check (prioridad in ('urgente','alta','normal')),
  fecha_tope  date,
  hecho       boolean not null default false,
  hecho_por   text,
  hecho_en    timestamptz,
  creado_por  text,
  creado_en   timestamptz not null default now(),
  origen      text,                       -- "manual", "lista 05/10", "whatsapp"...
  orden       integer not null default 0
);

create index if not exists pendientes_abiertos_idx on public.pendientes (hecho, area, prioridad, fecha_tope);

alter table public.pendientes enable row level security;
