-- Registro atómico de conteos físicos y aplicación de diferencias.
alter table public.conteos
  add column documento_ajuste_negativo_id bigint references public.documentos (id);

create or replace function private.proteger_conteo()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'Los conteos no se eliminan.';
  end if;

  if old.estado <> 'pendiente'
     or new.estado <> 'aprobado'
     or (new.id, new.fecha, new.alcance, new.categoria, new.ubicacion_id, new.creado_por)
        is distinct from
        (old.id, old.fecha, old.alcance, old.categoria, old.ubicacion_id, old.creado_por) then
    raise exception 'Un conteo solo puede pasar de pendiente a aprobado conservando su captura.';
  end if;
  return new;
end;
$$;

create trigger conteos_proteger
  before update or delete on public.conteos
  for each row execute function private.proteger_conteo();

create or replace function private.proteger_detalle_conteo()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_conteo_id bigint;
  v_estado public.estado_documento;
begin
  v_conteo_id := case when tg_op = 'DELETE' then old.conteo_id else new.conteo_id end;
  select c.estado into v_estado from public.conteos c where c.id = v_conteo_id;
  if v_estado is distinct from 'pendiente' or tg_op <> 'INSERT' then
    raise exception 'Las líneas capturadas de un conteo no se modifican ni se eliminan.';
  end if;
  return new;
end;
$$;

create trigger detalle_conteo_proteger
  before insert or update or delete on public.detalle_conteo
  for each row execute function private.proteger_detalle_conteo();

create or replace function private.registrar_conteo_core(
  p_alcance public.alcance_conteo,
  p_categoria text,
  p_ubicacion_id bigint,
  p_detalles jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_rol public.rol_usuario;
  v_conteo_id bigint;
  v_categoria text := nullif(btrim(p_categoria), '');
  v_linea jsonb;
  v_producto_id bigint;
  v_cantidad integer;
  v_esperados integer;
  v_capturados integer;
begin
  select u.rol into v_rol
  from public.usuarios u
  where u.id = v_usuario and u.activo;
  if v_usuario is null or v_rol is null or v_rol not in ('administrador', 'jefe_bodega') then
    raise exception 'Solo bodega o administracion puede registrar conteos.';
  end if;

  if p_alcance is null
     or (p_alcance = 'categoria' and v_categoria is null)
     or (p_alcance = 'total' and v_categoria is not null)
     or jsonb_typeof(p_detalles) is distinct from 'array'
     or jsonb_array_length(case when jsonb_typeof(p_detalles) = 'array' then p_detalles else '[]'::jsonb end) = 0 then
    raise exception 'Indique el alcance, categoria y los productos contados.';
  end if;

  perform 1 from public.ubicaciones u
  where u.id = p_ubicacion_id and u.activa
  for share;
  if not found then
    raise exception 'La ubicacion no existe o esta inactiva.';
  end if;

  perform 1
  from public.productos p
  where p.activo and (p_alcance = 'total' or p.categoria = v_categoria)
  order by p.id
  for share;

  select count(*)::integer into v_esperados
  from public.productos p
  where p.activo and (p_alcance = 'total' or p.categoria = v_categoria);

  select jsonb_array_length(p_detalles) into v_capturados;
  if v_esperados = 0 or v_capturados <> v_esperados then
    raise exception 'El conteo debe incluir todos los productos activos del alcance seleccionado.';
  end if;

  if (select count(distinct (value ->> 'producto_id')::bigint) from jsonb_array_elements(p_detalles)) <> v_capturados then
    raise exception 'Cada producto debe aparecer una sola vez en el conteo.';
  end if;

  for v_linea in select value from jsonb_array_elements(p_detalles)
  loop
    if jsonb_typeof(v_linea) is distinct from 'object' then
      raise exception 'Cada línea del conteo debe ser un objeto.';
    end if;
    v_producto_id := nullif(v_linea ->> 'producto_id', '')::bigint;
    v_cantidad := nullif(v_linea ->> 'cantidad_contada', '')::integer;
    if v_producto_id is null or v_cantidad is null or v_cantidad < 0
       or not exists (
         select 1 from public.productos p
         where p.id = v_producto_id and p.activo
           and (p_alcance = 'total' or p.categoria = v_categoria)
       ) then
      raise exception 'La línea incluye un producto fuera del alcance o una cantidad inválida.';
    end if;
  end loop;

  insert into public.existencias (producto_id, ubicacion_id, cantidad)
  select p.id, p_ubicacion_id, 0
  from public.productos p
  where p.activo and (p_alcance = 'total' or p.categoria = v_categoria)
  on conflict (producto_id, ubicacion_id) do nothing;

  perform 1
  from public.existencias e
  join public.productos p on p.id = e.producto_id
  where e.ubicacion_id = p_ubicacion_id
    and p.activo and (p_alcance = 'total' or p.categoria = v_categoria)
  order by e.producto_id
  for update of e;

  insert into public.conteos (alcance, categoria, ubicacion_id, estado, creado_por)
  values (p_alcance, v_categoria, p_ubicacion_id, 'pendiente', v_usuario)
  returning id into v_conteo_id;

  insert into public.detalle_conteo (conteo_id, producto_id, cantidad_sistema, cantidad_contada)
  select v_conteo_id,
         (linea ->> 'producto_id')::bigint,
         coalesce(e.cantidad, 0),
         (linea ->> 'cantidad_contada')::integer
  from jsonb_array_elements(p_detalles) as detalle(linea)
  left join public.existencias e
    on e.producto_id = (linea ->> 'producto_id')::bigint
   and e.ubicacion_id = p_ubicacion_id;

  return v_conteo_id;
end;
$$;

create or replace function private.aprobar_conteo_core(p_conteo_id bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario uuid := (select auth.uid());
  v_conteo public.conteos%rowtype;
  v_detalles jsonb;
  v_documento_positivo bigint;
  v_documento_negativo bigint;
  v_motivo text;
begin
  if v_usuario is null or not exists (
    select 1 from public.usuarios u
    where u.id = v_usuario and u.activo and u.rol = 'administrador'
  ) then
    raise exception 'Solo un administrador activo puede aprobar conteos.';
  end if;

  select c.* into v_conteo
  from public.conteos c
  where c.id = p_conteo_id
  for update;
  if not found or v_conteo.estado <> 'pendiente' then
    raise exception 'El conteo no existe o ya fue procesado.';
  end if;

  v_motivo := 'Ajuste por conteo fisico #' || v_conteo.id::text;
  select coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', dc.producto_id,
    'cantidad', dc.diferencia,
    'ubicacion_destino_id', v_conteo.ubicacion_id
  )), '[]'::jsonb) into v_detalles
  from public.detalle_conteo dc
  where dc.conteo_id = v_conteo.id and dc.diferencia > 0;
  if jsonb_array_length(v_detalles) > 0 then
    v_documento_positivo := private.registrar_movimiento_core(
      'ajuste_positivo', jsonb_build_object('motivo', v_motivo), v_detalles
    );
    perform private.aprobar_movimiento_core(v_documento_positivo);
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'producto_id', dc.producto_id,
    'cantidad', abs(dc.diferencia),
    'ubicacion_origen_id', v_conteo.ubicacion_id
  )), '[]'::jsonb) into v_detalles
  from public.detalle_conteo dc
  where dc.conteo_id = v_conteo.id and dc.diferencia < 0;
  if jsonb_array_length(v_detalles) > 0 then
    v_documento_negativo := private.registrar_movimiento_core(
      'ajuste_negativo', jsonb_build_object('motivo', v_motivo), v_detalles
    );
    perform private.aprobar_movimiento_core(v_documento_negativo);
  end if;

  update public.conteos c
  set estado = 'aprobado',
      documento_ajuste_id = v_documento_positivo,
      documento_ajuste_negativo_id = v_documento_negativo
  where c.id = v_conteo.id;
end;
$$;

create or replace function public.registrar_conteo(
  p_alcance public.alcance_conteo,
  p_categoria text,
  p_ubicacion_id bigint,
  p_detalles jsonb
)
returns bigint
language sql
security invoker
set search_path = ''
as $$
  select private.registrar_conteo_core(p_alcance, p_categoria, p_ubicacion_id, p_detalles);
$$;

create or replace function public.aprobar_conteo(p_conteo_id bigint)
returns void
language sql
security invoker
set search_path = ''
as $$
  select private.aprobar_conteo_core(p_conteo_id);
$$;

revoke insert, update, delete, truncate, references, trigger
on table public.conteos, public.detalle_conteo
from public, anon, authenticated;
drop policy if exists conteos_crear on public.conteos;
drop policy if exists conteos_editar on public.conteos;
drop policy if exists detalle_conteo_crear on public.detalle_conteo;

revoke all on function private.proteger_conteo() from public, anon, authenticated;
revoke all on function private.proteger_detalle_conteo() from public, anon, authenticated;
revoke all on function private.registrar_conteo_core(public.alcance_conteo, text, bigint, jsonb) from public, anon;
revoke all on function private.aprobar_conteo_core(bigint) from public, anon;
grant execute on function private.registrar_conteo_core(public.alcance_conteo, text, bigint, jsonb) to authenticated;
grant execute on function private.aprobar_conteo_core(bigint) to authenticated;

revoke all on function public.registrar_conteo(public.alcance_conteo, text, bigint, jsonb) from public, anon;
revoke all on function public.aprobar_conteo(bigint) from public, anon;
grant execute on function public.registrar_conteo(public.alcance_conteo, text, bigint, jsonb) to authenticated;
grant execute on function public.aprobar_conteo(bigint) to authenticated;

create trigger bitacora_conteos
  after insert or update or delete on public.conteos
  for each row execute function private.registrar_bitacora();
create trigger bitacora_detalle_conteo
  after insert or update or delete on public.detalle_conteo
  for each row execute function private.registrar_bitacora();
