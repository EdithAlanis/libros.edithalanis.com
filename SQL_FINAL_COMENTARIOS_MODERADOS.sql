-- ============================================================
-- PORTAL EDITORIAL EDITH ALANIS
-- COMENTARIOS MODERADOS + OBRA EXCLUSIVA
-- Ejecutar en el Supabase del Portal Editorial
-- ============================================================

-- 1. Corregir portal_comentarios para usar UUID
drop function if exists public.portal_enviar_comentario(bigint,text,text);
drop function if exists public.portal_comentarios_publicados(bigint);

alter table public.portal_comentarios
  alter column libro_id type uuid
  using libro_id::text::uuid;

-- 2. Funciones públicas de comentarios
create or replace function public.portal_enviar_comentario(
  p_libro_id uuid,
  p_nombre text,
  p_comentario text
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not exists(select 1 from public.portal_libros where id=p_libro_id) then
    raise exception 'libro';
  end if;

  if length(trim(coalesce(p_nombre,'')))<2
     or length(trim(coalesce(p_comentario,'')))<3
  then
    raise exception 'datos';
  end if;

  insert into public.portal_comentarios(libro_id,nombre,comentario,estado)
  values(
    p_libro_id,
    left(trim(p_nombre),80),
    left(trim(p_comentario),1200),
    'pendiente'
  );
end
$$;

create or replace function public.portal_comentarios_publicados(p_libro_id uuid)
returns table(
  id uuid,
  nombre text,
  comentario text,
  creado timestamptz
)
language sql
security definer
set search_path=public
as $$
  select c.id,c.nombre,c.comentario,c.creado
  from public.portal_comentarios c
  where c.libro_id=p_libro_id
    and c.estado='publicado'
  order by c.creado desc
$$;

grant execute on function public.portal_enviar_comentario(uuid,text,text) to anon,authenticated;
grant execute on function public.portal_comentarios_publicados(uuid) to anon,authenticated;

-- 3. Validación administrativa usando el acceso REAL del portal:
-- correo + NIP mediante acceso_por_correo_nip.
create or replace function public._portal_es_admin(p_email text,p_nip text)
returns boolean
language sql
security definer
set search_path=public
as $$
  select exists(
    select 1
    from public.acceso_por_correo_nip(lower(trim(p_email)),trim(p_nip)) x
    where x.tipo_usuario='administrador'
      and x.activo=true
  )
$$;

-- 4. Listar comentarios para administración
create or replace function public.portal_admin_comentarios(
  p_email text,
  p_nip text,
  p_estado text default 'pendiente'
)
returns table(
  id uuid,
  libro_id uuid,
  libro_titulo text,
  nombre text,
  comentario text,
  estado text,
  creado timestamptz
)
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public._portal_es_admin(p_email,p_nip) then
    raise exception 'permiso';
  end if;

  return query
  select
    c.id,
    c.libro_id,
    l.titulo,
    c.nombre,
    c.comentario,
    c.estado,
    c.creado
  from public.portal_comentarios c
  join public.portal_libros l on l.id=c.libro_id
  where p_estado='todos' or c.estado=p_estado
  order by c.creado desc;
end
$$;

-- 5. Publicar comentario
create or replace function public.portal_admin_publicar_comentario(
  p_email text,
  p_nip text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public._portal_es_admin(p_email,p_nip) then
    raise exception 'permiso';
  end if;

  update public.portal_comentarios
  set estado='publicado'
  where id=p_id;
end
$$;

-- 6. Ocultar un comentario publicado sin borrarlo
create or replace function public.portal_admin_ocultar_comentario(
  p_email text,
  p_nip text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public._portal_es_admin(p_email,p_nip) then
    raise exception 'permiso';
  end if;

  update public.portal_comentarios
  set estado='pendiente'
  where id=p_id;
end
$$;

-- 7. Eliminar comentario
create or replace function public.portal_admin_eliminar_comentario(
  p_email text,
  p_nip text,
  p_id uuid
)
returns void
language plpgsql
security definer
set search_path=public
as $$
begin
  if not public._portal_es_admin(p_email,p_nip) then
    raise exception 'permiso';
  end if;

  delete from public.portal_comentarios where id=p_id;
end
$$;

grant execute on function public._portal_es_admin(text,text) to anon,authenticated;
grant execute on function public.portal_admin_comentarios(text,text,text) to anon,authenticated;
grant execute on function public.portal_admin_publicar_comentario(text,text,uuid) to anon,authenticated;
grant execute on function public.portal_admin_ocultar_comentario(text,text,uuid) to anon,authenticated;
grant execute on function public.portal_admin_eliminar_comentario(text,text,uuid) to anon,authenticated;

-- 8. Dejar "La tecnología en tiempos de postpandemia" como obra exclusiva y en construcción
update public.portal_libros
set titulo='La tecnología en tiempos de postpandemia',
    estado='construccion',
    lectura_gratuita=false,
    updated_at=now()
where lower(titulo) in (
  lower('La tecnología en tiempos de postpandemia'),
  lower('La tecnología en tiempos de postpandemia'),
  lower('La tecnología en tiempos de postpandemia'),
  lower('La tecnología en tiempos de postpandemia')
);

-- 9. Comprobación
select
  (select count(*) from public.portal_comentarios) as comentarios,
  (select count(*) from public.portal_libros
   where lower(titulo)=lower('La tecnología en tiempos de postpandemia')) as libro_exclusivo;
