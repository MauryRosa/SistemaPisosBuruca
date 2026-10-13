import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { AuthContext } from './auth-context.js';

const DOMINIO = import.meta.env.VITE_AUTH_DOMAIN || 'pisosburuca.local';
const INACTIVIDAD_MS = 30 * 60 * 1000;
const EVENTOS_ACTIVIDAD = ['pointerdown', 'keydown', 'scroll', 'touchstart'];

function aCorreo(usuario) {
  const limpio = usuario.trim().toLowerCase();
  return limpio.includes('@') ? limpio : `${limpio}@${DOMINIO}`;
}

function mensajeDeError(error) {
  if (!error) return null;
  if (error.message?.includes('Invalid login credentials')) return 'Usuario o contraseña incorrectos.';
  if (error.message?.toLowerCase().includes('fetch')) return 'No hay conexión con el servidor. Revisa tu internet.';
  return 'No se pudo iniciar sesión. Intenta de nuevo.';
}

export default function AuthProvider({ children }) {
  const [sesion, setSesion] = useState(null);
  const [perfil, setPerfil] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [aviso, setAviso] = useState(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSesion(data.session);
      if (!data.session) setCargando(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_evento, nuevaSesion) => {
      setSesion(nuevaSesion);
      if (!nuevaSesion) {
        setPerfil(null);
        setCargando(false);
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const usuarioId = sesion?.user?.id;
  useEffect(() => {
    if (!usuarioId) return;
    let vigente = true;
    setCargando(true);
    supabase.from('usuarios').select('id, nombre, usuario, rol, activo').eq('id', usuarioId).maybeSingle()
      .then(({ data, error }) => {
        if (!vigente) return;
        if (error || !data || !data.activo) {
          setAviso('inactiva');
          setPerfil(null);
          supabase.auth.signOut();
        } else setPerfil(data);
        setCargando(false);
      });
    return () => { vigente = false; };
  }, [usuarioId]);

  useEffect(() => {
    if (!sesion) return;
    let temporizador;
    const reiniciar = () => {
      clearTimeout(temporizador);
      temporizador = setTimeout(() => {
        setAviso('expirada');
        supabase.auth.signOut();
      }, INACTIVIDAD_MS);
    };
    reiniciar();
    EVENTOS_ACTIVIDAD.forEach((e) => window.addEventListener(e, reiniciar, { passive: true }));
    return () => {
      clearTimeout(temporizador);
      EVENTOS_ACTIVIDAD.forEach((e) => window.removeEventListener(e, reiniciar));
    };
  }, [sesion]);

  const iniciarSesion = useCallback(async (usuario, contrasena) => {
    setAviso(null);
    const { error } = await supabase.auth.signInWithPassword({ email: aCorreo(usuario), password: contrasena });
    return mensajeDeError(error);
  }, []);
  const cerrarSesion = useCallback(async () => {
    setAviso(null);
    await supabase.auth.signOut();
  }, []);
  const valor = useMemo(() => ({ sesion, perfil, cargando, aviso, iniciarSesion, cerrarSesion }), [sesion, perfil, cargando, aviso, iniciarSesion, cerrarSesion]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
