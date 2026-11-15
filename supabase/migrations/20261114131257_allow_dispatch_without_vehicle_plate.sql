-- RF-30 solo requiere placa cuando el retiro se hace en vehículo.
-- El RPC sigue exigiendo el nombre de quien retira.
drop trigger if exists documentos_validar_placa_despacho on public.documentos;
drop function if exists private.validar_placa_despacho();
