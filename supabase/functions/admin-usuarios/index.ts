import { createClient } from 'npm:@supabase/supabase-js@2.47.10';

// Origen permitido: ALLOWED_ORIGIN (ej. https://inventario.ejemplo.com). Sin definirlo se mantiene '*',
// que es seguro aquí porque la función exige un token Bearer y no usa cookies.
const origenPermitido = Deno.env.get('ALLOWED_ORIGIN')?.trim() || '*';
const corsHeaders = {
  'Access-Control-Allow-Origin': origenPermitido,
  'Vary': 'Origin',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function responder(estado: number, cuerpo: Record<string, unknown>) {
  return new Response(JSON.stringify(cuerpo), {
    status: estado,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (solicitud) => {
  if (solicitud.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (solicitud.method !== 'POST') return responder(405, { error: 'Método no permitido.' });

  const autorizacion = solicitud.headers.get('Authorization');
  if (!autorizacion?.startsWith('Bearer ')) return responder(401, { error: 'Inicia sesión para continuar.' });

  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !anonKey || !serviceRoleKey) return responder(500, { error: 'La función no tiene la configuración del servidor.' });

  const clienteSesion = createClient(url, anonKey, {
    global: { headers: { Authorization: autorizacion } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: resultadoUsuario, error: errorUsuario } = await clienteSesion.auth.getUser();
  if (errorUsuario || !resultadoUsuario.user) return responder(401, { error: 'La sesión no es válida.' });

  const administrador = createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: perfil, error: errorPerfil } = await administrador
    .from('usuarios')
    .select('id,rol,activo')
    .eq('id', resultadoUsuario.user.id)
    .maybeSingle();
  if (errorPerfil || !perfil?.activo || perfil.rol !== 'administrador') {
    return responder(403, { error: 'Solo un administrador activo puede crear usuarios.' });
  }

  let datos: Record<string, unknown>;
  try {
    const cuerpo = await solicitud.json();
    if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
      return responder(400, { error: 'El cuerpo de la solicitud debe ser un objeto.' });
    }
    datos = cuerpo as Record<string, unknown>;
  } catch {
    return responder(400, { error: 'El cuerpo de la solicitud no es válido.' });
  }

  const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim() : '';
  const usuario = typeof datos.usuario === 'string' ? datos.usuario.trim().toLowerCase() : '';
  const rol = datos.rol;
  const contrasena = typeof datos.contrasena === 'string' ? datos.contrasena : '';
  const dominio = (Deno.env.get('AUTH_DOMAIN') || '').trim().toLowerCase();
  if (nombre.length < 2 || nombre.length > 120) return responder(400, { error: 'El nombre debe tener entre 2 y 120 caracteres.' });
  if (!/^[a-z0-9._-]{3,30}$/.test(usuario)) return responder(400, { error: 'El usuario debe tener 3 a 30 caracteres: letras, números, punto, guion o guion bajo.' });
  if (!['administrador', 'jefe_bodega', 'vendedora'].includes(String(rol))) return responder(400, { error: 'Selecciona un rol válido.' });
  if (contrasena.length < 12 || contrasena.length > 128) return responder(400, { error: 'La contraseña inicial debe tener entre 12 y 128 caracteres.' });
  if (!/^(?=.{3,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(?:\.(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?))*$/.test(dominio)) {
    return responder(500, { error: 'El dominio de inicio de sesión no está configurado correctamente.' });
  }

  const { data: existente, error: errorExistente } = await administrador
    .from('usuarios')
    .select('id')
    .eq('usuario', usuario)
    .maybeSingle();
  if (errorExistente) return responder(500, { error: 'No se pudo verificar el nombre de usuario.' });
  if (existente) return responder(409, { error: 'Ese nombre de usuario ya existe.' });

  const email = `${usuario}@${dominio}`;
  const { data: usuarioAuth, error: errorCrear } = await administrador.auth.admin.createUser({
    email,
    password: contrasena,
    email_confirm: true,
    user_metadata: { nombre, usuario },
  });
  if (errorCrear || !usuarioAuth.user) return responder(409, { error: 'No se pudo crear la cuenta. Revisa si el usuario ya existe.' });

  const { error: errorInsertarPerfil } = await clienteSesion.from('usuarios').insert({
    id: usuarioAuth.user.id,
    nombre,
    usuario,
    rol,
    activo: true,
  });
  if (errorInsertarPerfil) {
    let cuentaLimpia = false;
    try {
      const { error: errorLimpieza } = await administrador.auth.admin.deleteUser(usuarioAuth.user.id);
      cuentaLimpia = !errorLimpieza;
    } catch {
      cuentaLimpia = false;
    }
    if (!cuentaLimpia) {
      return responder(500, { error: 'No se pudo crear el perfil y la cuenta de acceso quedó pendiente de limpieza. Revisa Authentication antes de volver a intentarlo.' });
    }
    if (errorInsertarPerfil.code === '23505') return responder(409, { error: 'Ese nombre de usuario ya existe.' });
    return responder(500, { error: 'No se pudo crear el perfil. La cuenta incompleta se limpió.' });
  }

  return responder(201, { id: usuarioAuth.user.id, nombre, usuario, rol });
});
