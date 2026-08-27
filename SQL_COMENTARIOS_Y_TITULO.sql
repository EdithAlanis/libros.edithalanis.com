-- PORTAL EDITORIAL EDITH ALANIS
-- Comentarios moderados + cambio de título de la obra exclusiva

create extension if not exists pgcrypto with schema extensions;

create table if not exists public.portal_comentarios (
  id uuid primary key default gen_random_uuid(),
  libro_id bigint not null,
  nombre text not null,
  comentario text not null,
  estado text not null default 'pendiente' check (estado in ('pendiente','publicado')),
  creado timestamptz not null default now()
);
alter table public.portal_comentarios enable row level security;

create or replace function public.portal_enviar_comentario(p_libro_id bigint,p_nombre text,p_comentario text)
returns void language plpgsql security definer set search_path=public as $$
begin
 if length(trim(coalesce(p_nombre,'')))<2 or length(trim(coalesce(p_comentario,'')))<3 then raise exception 'datos'; end if;
 insert into portal_comentarios(libro_id,nombre,comentario)
 values(p_libro_id,left(trim(p_nombre),80),left(trim(p_comentario),1200));
end $$;

create or replace function public.portal_comentarios_publicados(p_libro_id bigint)
returns table(nombre text,comentario text,creado timestamptz)
language sql security definer set search_path=public as $$
 select c.nombre,c.comentario,c.creado from portal_comentarios c
 where c.libro_id=p_libro_id and c.estado='publicado' order by c.creado desc
$$;

grant execute on function public.portal_enviar_comentario(bigint,text,text) to anon, authenticated;
grant execute on function public.portal_comentarios_publicados(bigint) to anon, authenticated;

-- Cambia el título en cualquier tabla pública que tenga columnas titulo/title e id,
-- sin asumir de antemano el nombre interno de la tabla del catálogo.
do $$
declare r record;
begin
 for r in
   select table_schema,table_name,column_name
   from information_schema.columns
   where table_schema='public' and column_name in ('titulo','title')
 loop
   begin
     execute format(
       'update %I.%I set %I=$1 where lower(%I) in ($2,$3,$4)',
       r.table_schema,r.table_name,r.column_name,r.column_name
     )
     using 'Edith y su amigo especial',
           lower('Para Nicolás y su amigo especial'),
           lower('Nicolás y su amigo especial'),
           lower('Nicolas y su amigo especial');
   exception when others then
     null;
   end;
 end loop;
end $$;

-- Para la moderación desde el panel administrativo se instalarán estas funciones
-- una vez confirmado el mecanismo de sesión/credenciales del portal.
select count(*) as comentarios_actuales from public.portal_comentarios;
