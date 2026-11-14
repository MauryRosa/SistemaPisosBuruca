-- Solo los perfiles autenticados pueden consultar los indicadores del dashboard.
revoke all on function public.resumen_dashboard()
  from public, anon, authenticated;

grant execute on function public.resumen_dashboard() to authenticated;
