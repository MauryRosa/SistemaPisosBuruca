import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { AuthContext } from './auth-context.js';

const DOMINIO = import.meta.env.VITE_AUTH_DOMAIN || 'pisosburuca.local';
const INACTIVIDAD_MS = 30 * 60 * 1000;
const EVENTOS_ACTIVIDAD = ['pointerdown', 'pointermove', 'keydown', 'scroll', 'touchstart'];

function claveActividad(usuarioId) {
  return `pisos-buruca:ultima-actividad:${usuarioId}`;
}

function leerActividad(usuarioId) {
  try {
    const valor = Number(window.localStorage.getItem(claveActividad(usuarioId)));
    return Number.isFinite(valor) && valor > 0 ? valor : null;
  } catch {
    return null;
  }
}

function guardarActividad(usuarioId, marca) {
  try {
    window.localStorage.setItem(claveActividad(usuarioId), String(marca));
    return true;
  } catch {
    return false;
  }
}

function borrarActividad(usuarioId) {
  try {
    window.localStorage.removeItem(claveActividad(usuarioId));
  } catch {
    // La sesión de Supabase se cierra aunque el navegador no permita limpiar localStorage.
  }
}

function actividadVigente(usuarioId, ahora = Date.now()) {
  const marca = leerActividad(usuarioId);
  return marca !== null && marca <= ahora + 60_000 && ahora - marca < INACTIVIDAD_MS;
}

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
  const [marcaActividad, setMarcaActividad] = useState(null);
  const usuarioActualRef = useRef(null);
  const loginEnCursoRef = useRef(false);

  useEffect(() => {
    let vigente = true;
    const { data } = supabase.auth.onAuthStateChange((evento, nuevaSesion) => {
      if (!vigente) return;

      if (!nuevaSesion) {
        if (usuarioActualRef.current) borrarActividad(usuarioActualRef.current);
        usuarioActualRef.current = null;
        setMarcaActividad(null);
        setSesion(null);
        setPerfil(null);
        setCargando(false);
        return;
      }

      const usuarioId = nuevaSesion.user.id;
      if (usuarioActualRef.current && usuarioActualRef.current !== usuarioId) {
        borrarActividad(usuarioActualRef.current);
      }
      usuarioActualRef.current = usuarioId;

      if (evento === 'SIGNED_IN' && loginEnCursoRef.current) {
        const marca = Date.now();
        if (!guardarActividad(usuarioId, marca)) {
          setAviso('expirada');
          setMarcaActividad(null);
          setSesion(null);
          setPerfil(null);
          setCargando(false);
          window.setTimeout(() => { void supabase.auth.signOut(); }, 0);
          return;
        }
        setMarcaActividad(marca);
      } else if (!actividadVigente(usuarioId)) {
        setAviso('expirada');
        setMarcaActividad(null);
        setSesion(null);
        setPerfil(null);
        setCargando(false);
        window.setTimeout(() => { void supabase.auth.signOut(); }, 0);
        return;
      } else {
        setMarcaActividad(leerActividad(usuarioId));
      }

      setSesion(nuevaSesion);
    });
    return () => {
      vigente = false;
      data.subscription.unsubscribe();
    };
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
    if (!usuarioId || !marcaActividad) return undefined;
    let temporizador;
    const clave = claveActividad(usuarioId);
    let ultimaActividad = marcaActividad;

    const expirar = () => {
      setAviso('expirada');
      void supabase.auth.signOut();
    };
    const programarExpiracion = (marca) => {
      clearTimeout(temporizador);
      const restante = INACTIVIDAD_MS - (Date.now() - marca);
      if (restante <= 0) {
        expirar();
        return;
      }
      temporizador = window.setTimeout(expirar, restante);
    };

    if (!actividadVigente(usuarioId) || ultimaActividad === null) {
      expirar();
      return undefined;
    }
    programarExpiracion(ultimaActividad);

    const registrarActividad = () => {
      const ahora = Date.now();
      if (document.visibilityState === 'hidden' || ahora - ultimaActividad < 10_000) return;
      if (!guardarActividad(usuarioId, ahora)) {
        expirar();
        return;
      }
      ultimaActividad = ahora;
      setMarcaActividad(ahora);
      programarExpiracion(ahora);
    };
    const sincronizarActividad = (evento) => {
      if (evento.key !== clave || !evento.newValue) return;
      const marca = Number(evento.newValue);
      if (!Number.isFinite(marca) || marca <= 0 || marca > Date.now() + 60_000) {
        expirar();
        return;
      }
      ultimaActividad = Math.max(ultimaActividad, marca);
      setMarcaActividad(ultimaActividad);
      if (Date.now() - ultimaActividad >= INACTIVIDAD_MS) expirar();
      else programarExpiracion(ultimaActividad);
    };

    EVENTOS_ACTIVIDAD.forEach((evento) => window.addEventListener(evento, registrarActividad, { passive: true }));
    window.addEventListener('storage', sincronizarActividad);
    return () => {
      clearTimeout(temporizador);
      EVENTOS_ACTIVIDAD.forEach((evento) => window.removeEventListener(evento, registrarActividad));
      window.removeEventListener('storage', sincronizarActividad);
    };
  }, [marcaActividad, usuarioId]);

  const iniciarSesion = useCallback(async (usuario, contrasena) => {
    setAviso(null);
    loginEnCursoRef.current = true;
    let resultado;
    try {
      resultado = await supabase.auth.signInWithPassword({ email: aCorreo(usuario), password: contrasena });
    } finally {
      loginEnCursoRef.current = false;
    }
    const { data, error } = resultado;
    if (!error && data.session) {
      const marca = Date.now();
      if (!guardarActividad(data.session.user.id, marca)) {
        setAviso('expirada');
        await supabase.auth.signOut();
        return 'No se pudo iniciar sesión. Intenta de nuevo.';
      }
      setMarcaActividad(marca);
    }
    return mensajeDeError(error);
  }, []);
  const cerrarSesion = useCallback(async () => {
    setAviso(null);
    await supabase.auth.signOut();
  }, []);
  const valor = useMemo(() => ({ sesion, perfil, cargando, aviso, iniciarSesion, cerrarSesion }), [sesion, perfil, cargando, aviso, iniciarSesion, cerrarSesion]);
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}
