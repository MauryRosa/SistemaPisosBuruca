-- RF-30: toda venta o entrega registra a quien retira y la placa del vehículo.
create or replace function private.validar_placa_despacho()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tipo in ('salida_venta', 'despacho_minibodega')
     and nullif(btrim(new.placa), '') is null then
    raise exception 'Indique la placa del vehiculo que retira el producto.';
  end if;

  return new;
end;
$$;

create trigger documentos_validar_placa_despacho
  before insert on public.documentos
  for each row execute function private.validar_placa_despacho();

revoke all on function private.validar_placa_despacho() from public, anon, authenticated;
