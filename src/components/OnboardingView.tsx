/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import TruekMascot from './TruekMascot';
import GuidelinesView from './GuidelinesView';
import { OnboardingState } from '../types';
import { INITIAL_INTERESTS } from '../data/mockData';
import { supabase } from '../lib/supabaseClient';
import { requestBrowserLocation, reverseGeocode } from '../lib/geo';
import { normalizeUsername, isValidUsernameFormat, isUsernameAvailable, resolveLoginEmail } from '../lib/username';

interface OnboardingViewProps {
  onboardingState: OnboardingState;
  setOnboardingState: React.Dispatch<React.SetStateAction<OnboardingState>>;
  onAdvance: () => void;
  addLog: (title: string, data: any) => void;
}

export default function OnboardingView({
  onboardingState,
  setOnboardingState,
  onAdvance,
  addLog,
}: OnboardingViewProps) {
  const [emailText, setEmailText] = useState('');
  const [passwordText, setPasswordText] = useState('');
  // Solo se usa en modo "signup": nombre de usuario elegido a mano. Si
  // queda vacío, el trigger de alta en Supabase le asigna el inicio del
  // mail automáticamente.
  const [usernameText, setUsernameText] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [authMode, setAuthMode] = useState<'signup' | 'signin'>('signup');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  // Dispara (y re-dispara con "Reintentar") la detección de ubicación.
  // OJO: el efecto de abajo depende de ESTE contador, nunca de
  // onboardingState.locationStatus — si dependiera de locationStatus, el
  // propio efecto cambiándolo a 'detecting' dispararía una re-ejecución
  // inmediata cuyo cleanup cancelaba la petición de ubicación recién
  // iniciada, dejando el spinner colgado para siempre (ese era el bug).
  const [locationAttempt, setLocationAttempt] = useState(0);

  // Solo aplica en modo "signup": tiene que aceptar las normas de la
  // comunidad antes de poder crear la cuenta. showGuidelinesModal abre el
  // texto completo para leerlo (se puede aceptar desde ahí directamente).
  const [acceptedGuidelines, setAcceptedGuidelines] = useState(false);
  const [showGuidelinesModal, setShowGuidelinesModal] = useState(false);

  // Pide la ubicación real al navegador (requiere permiso del usuario).
  // Si falla o la rechaza, cae a modo manual: el usuario escribe su zona
  // a mano (sin coordenadas, así que para esa cuenta la distancia en el
  // Catálogo va a quedar "desconocida" hasta que la actualice).
  useEffect(() => {
    let cancelled = false;
    let settled = false;
    setOnboardingState(prev => ({ ...prev, locationStatus: 'detecting' }));
    addLog('Ubicación: pidiendo tu ubicación real al navegador...', {});

    // Red de seguridad: requestBrowserLocation ya tiene un timeout propio
    // de 10s, pero por si el navegador nunca llega a invocar ni el éxito
    // ni el error (bug del navegador, pestaña en segundo plano, etc.),
    // después de 15s forzamos el modo manual en vez de dejar el spinner
    // girando para siempre.
    const safetyTimer = setTimeout(() => {
      if (cancelled || settled) return;
      settled = true;
      setOnboardingState(prev => ({
        ...prev,
        locationStatus: 'manual',
        locationError: 'La detección automática tardó demasiado. Podés escribir tu ubicación a mano o reintentar.',
      }));
      addLog('Ubicación: se agotó el tiempo de espera, pasamos a modo manual', {});
    }, 15000);

    (async () => {
      const { coords, error } = await requestBrowserLocation();
      if (cancelled || settled) return;

      if (!coords) {
        settled = true;
        clearTimeout(safetyTimer);
        setOnboardingState(prev => ({ ...prev, locationStatus: 'manual', locationError: error }));
        addLog('Ubicación: no se pudo detectar automáticamente, pasamos a modo manual', { message: error });
        return;
      }

      addLog('Ubicación: coordenadas reales obtenidas del navegador', { lat: coords.lat, lng: coords.lng });

      const place = await reverseGeocode(coords);
      if (cancelled || settled) return;

      settled = true;
      clearTimeout(safetyTimer);
      setOnboardingState(prev => ({
        ...prev,
        locationStatus: 'detected',
        locationText: place ?? `Ubicación detectada (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`,
        lat: coords.lat,
        lng: coords.lng,
        locationError: null,
      }));
      addLog('Ubicación: geolocalización real exitosa', {
        resolvedLocation: place ?? 'sin nombre legible (reverse geocoding falló)',
        lat: coords.lat,
        lng: coords.lng,
      });
    })();

    return () => {
      cancelled = true;
      clearTimeout(safetyTimer);
    };
  }, [locationAttempt]);

  // Update progress bar
  useEffect(() => {
    let filledFields = 0;
    if (emailText.length > 3) filledFields += 1;
    if (passwordText.length > 5) filledFields += 1;
    if (
      onboardingState.locationStatus === 'detected' ||
      (onboardingState.locationStatus === 'manual' && onboardingState.locationText.trim().length > 0)
    ) {
      filledFields += 1;
    }
    if (onboardingState.selectedInterests.length > 0) filledFields += 1;

    // Base 15% progress + remaining partitioned up to 100%
    const calculated = 15 + Math.round((filledFields / 4) * 85);
    setOnboardingState(prev => ({ ...prev, progress: calculated }));
  }, [emailText, passwordText, onboardingState.locationStatus, onboardingState.locationText, onboardingState.selectedInterests]);

  // Chequeo en vivo (con debounce) de disponibilidad del username elegido
  // al registrarse. Vacío = "idle" (se usa el default del mail, ningún
  // problema). Solo corre en modo signup, donde se muestra el campo.
  useEffect(() => {
    if (authMode !== 'signup') return;
    const trimmed = usernameText.trim();
    if (trimmed.length === 0) {
      setUsernameStatus('idle');
      return;
    }
    const normalized = normalizeUsername(trimmed);
    if (!isValidUsernameFormat(normalized)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { available, error } = await isUsernameAvailable(normalized);
      if (cancelled) return;
      if (error) {
        setUsernameStatus('idle');
        return;
      }
      setUsernameStatus(available ? 'available' : 'taken');
    }, 500);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [usernameText, authMode]);

  const handleInterestToggle = (interest: string) => {
    setOnboardingState(prev => {
      const interests = prev.selectedInterests.includes(interest)
        ? prev.selectedInterests.filter(i => i !== interest)
        : [...prev.selectedInterests, interest];
      
      const action = prev.selectedInterests.includes(interest) ? 'remove_interest' : 'add_interest';
      addLog(`Interés: Usuario actualizó tags (${action}: "${interest}")`, {
        current_interests: interests,
      });

      return {
        ...prev,
        selectedInterests: interests,
      };
    });
  };

  const handleManualLocationChange = (text: string) => {
    setOnboardingState(prev => ({ ...prev, locationText: text }));
  };

  const handleRetryLocation = () => {
    addLog('Ubicación: reintentando geolocalización real', {});
    setOnboardingState(prev => ({ ...prev, locationStatus: 'idle', locationError: null }));
    setLocationAttempt(prev => prev + 1);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthNotice(null);

    if (authMode === 'signup' && !acceptedGuidelines) {
      setAuthError('Para crear tu cuenta, primero tenés que leer y aceptar las normas de la comunidad.');
      return;
    }

    setIsSubmitting(true);

    try {
      if (authMode === 'signup') {
        const trimmedUsername = usernameText.trim();
        // Defensa extra además del botón deshabilitado: si eligió un
        // username y todavía no sabemos que está disponible (por ej. el
        // debounce no llegó a terminar), no mandamos el registro.
        if (trimmedUsername.length > 0 && usernameStatus !== 'available') {
          setAuthError('Ese nombre de usuario no está disponible. Elegí otro o dejá el campo vacío.');
          setIsSubmitting(false);
          return;
        }
        const normalizedUsername = trimmedUsername.length > 0 ? normalizeUsername(trimmedUsername) : undefined;

        addLog('Registro: Creando cuenta real en Supabase Auth', {
          email: emailText,
          username: normalizedUsername ?? '(se genera del mail)',
          detected_location: onboardingState.locationText,
          selected_interests: onboardingState.selectedInterests,
        });

        const { data, error } = await supabase.auth.signUp({
          email: emailText,
          password: passwordText,
          options: {
            data: {
              display_name: emailText.split('@')[0],
              ...(normalizedUsername ? { username: normalizedUsername } : {}),
              interests: onboardingState.selectedInterests,
            },
          },
        });

        if (error) throw error;

        if (!data.session) {
          // El proyecto tiene confirmación de email activada: todavía no hay sesión.
          addLog('Registro: cuenta creada, pendiente de confirmación por email', {
            user_id: data.user?.id,
          });
          setAuthNotice('¡Cuenta creada! Revisá tu email para confirmarla y después iniciá sesión acá abajo.');
          setAuthMode('signin');
          setIsSubmitting(false);
          return;
        }

        addLog('Registro: sesión iniciada automáticamente tras el registro', {
          user_id: data.user?.id,
        });

        if (onboardingState.locationText) {
          const { error: updateError } = await supabase
            .from('user_profiles')
            .update({
              location: onboardingState.locationText,
              lat: onboardingState.lat,
              lng: onboardingState.lng,
            })
            .eq('id', data.user!.id);
          if (updateError) {
            addLog('Perfil: no se pudo guardar la ubicación detectada', { message: updateError.message });
          }
        }

        const { error: termsError } = await supabase
          .from('user_profiles')
          .update({ terms_accepted_at: new Date().toISOString() })
          .eq('id', data.user!.id);
        if (termsError) {
          addLog('Perfil: no se pudo guardar la aceptación de las normas', { message: termsError.message });
        }
      } else {
        addLog('Login: Resolviendo si el identificador ingresado es mail o nombre de usuario', { identifier: emailText });

        const { email: resolvedEmail, error: resolveError } = await resolveLoginEmail(emailText);
        if (resolveError || !resolvedEmail) {
          throw new Error(resolveError ?? 'No encontramos ninguna cuenta con ese mail o nombre de usuario.');
        }

        addLog('Login: Iniciando sesión real en Supabase Auth', { email: resolvedEmail });

        const { data, error } = await supabase.auth.signInWithPassword({
          email: resolvedEmail,
          password: passwordText,
        });

        if (error) throw error;

        addLog('Login: sesión iniciada correctamente', { user_id: data.user?.id });
      }

      onAdvance();
    } catch (err: any) {
      const message = err?.message ?? 'Ocurrió un error inesperado. Probá de nuevo.';
      setAuthError(message);
      addLog('Auth: error', { message });
    } finally {
      setIsSubmitting(false);
    }
  };

  const usernameOk =
    usernameText.trim().length === 0 || (isValidUsernameFormat(normalizeUsername(usernameText.trim())) && usernameStatus === 'available');

  const isFormValid =
    authMode === 'signup'
      ? emailText.includes('@') && passwordText.length >= 6 && usernameOk && acceptedGuidelines
      : emailText.trim().length > 0 && passwordText.length >= 6;

  return (
    <div className="relative flex flex-col md:flex-row min-h-screen w-full bg-canvas overflow-hidden">
      
      {/* Upper Progress Indicator Bar */}
      <div className="absolute top-0 left-0 w-full h-[6px] bg-bg-soft z-30">
        <div 
          className="h-full bg-primary transition-all duration-500 shadow-[0_0_8px_rgba(45,95,62,0.4)]"
          style={{ width: `${onboardingState.progress}%` }}
        />
      </div>

      {/* Hero Left Panel */}
      <section className="relative hidden lg:flex flex-col justify-between w-5/12 p-8 bg-primary text-white overflow-hidden">
        {/* Background Radial Shimmer */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_50%_40%,rgba(156,203,59,0.28),transparent_65%)]" />

        {/* Blobs orgánicos decorativos — lejos del ícono/wordmark de arriba
            para no solaparlos, uno arriba a la derecha y otro abajo a la
            izquierda, bien separados del contenido (que va en z-10). */}
        <div aria-hidden="true" className="absolute -top-20 -right-16 w-72 h-72 bg-violet-vivid/30 blob-shape-2 pointer-events-none z-0" />
        <div aria-hidden="true" className="absolute -bottom-24 -left-14 w-60 h-60 bg-gold/25 blob-shape-3 pointer-events-none z-0" />

        <div className="relative z-10">
          <div className="w-11 h-11 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center mb-3">
            <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true">
              <polygon points="2,3 2,21 12,12" fill="#9CCB3B" />
              <polygon points="22,3 22,21 12,12" fill="#E8B923" />
            </svg>
          </div>
          <span className="inline-block -rotate-2 bg-white/10 border border-white/20 rounded-md px-2 py-0.5 font-sans font-bold tracking-widest text-primary-light text-[11px] hover:rotate-0 hover:scale-105 transition-transform duration-300 ease-bounce cursor-default mb-2">TRUEK INTÉLIGENT</span>
          <h1 className="font-display text-4xl md:text-5xl font-extrabold tracking-tight leading-none text-white mb-2 -rotate-1 inline-block">TrueK</h1>
          <p className="font-sans text-sm text-primary-light/90">Libera el valor de las cosas que ya no usas intercambiando con tu comunidad.</p>
          <TruekMascot className="w-16 h-16 mt-3 -rotate-6 animate-truek-float" />
        </div>

        <div className="relative z-10 bg-white/10 backdrop-blur-md rounded-xl p-4 border border-white/20 -rotate-1 hover:rotate-0 hover:scale-[1.02] transition-transform duration-300 ease-bounce">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-rounded text-[20px] text-primary-light">explore</span>
            <span className="text-xs font-bold tracking-wider uppercase text-primary-light/85">Geolocalización Activa</span>
          </div>
          <p className="text-xs text-white/95">Detección automática de zonas comerciales para emparejarte con personas cerca tuyo, a menos de 5 kilómetros.</p>
        </div>

        <div className="relative z-0 opacity-15 pointer-events-none select-none animate-truek-float">
          <svg className="w-full h-auto" viewBox="0 0 200 120" xmlns="http://www.w3.org/2000/svg">
            <path d="M 10,60 Q 50,110 100,60 T 190,60" fill="none" stroke="white" strokeWidth="2" />
            <circle cx="100" cy="60" r="8" fill="white" />
            <circle cx="50" cy="85" r="5" fill="white" />
          </svg>
        </div>
      </section>

      {/* Right Onboarding Content Area */}
      <section className="flex-1 p-6 md:p-8 flex flex-col justify-between">
        <div className="space-y-6">
          <header className="text-center md:text-left">
            <div className="lg:hidden mb-2 flex items-center justify-center md:justify-start gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shrink-0">
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <polygon points="2,3 2,21 12,12" fill="#9CCB3B" />
                  <polygon points="22,3 22,21 12,12" fill="#E8B923" />
                </svg>
              </div>
              <span className="font-display text-2xl font-black tracking-tighter">
                Tru<span className="text-plum">e</span><span className="text-primary-dark">K</span>
              </span>
            </div>
            <h2 id="onboarding-welcome-title" className="font-display text-2xl font-black text-primary-dark leading-none mb-1">
              {authMode === 'signup' ? 'Únete a TrueK' : 'Iniciá sesión en TrueK'}
            </h2>
            <p className="text-xs text-ink-soft">
              {authMode === 'signup'
                ? 'Registra tu cuenta y descubre quién tiene lo que buscas cerca de ti.'
                : 'Ingresá con el email o nombre de usuario y la contraseña de tu cuenta de TrueK.'}
            </p>
          </header>

          {authNotice && (
            <div id="auth-notice-box" className="p-3 bg-sky-50 border border-sky-200 rounded-xl text-xs text-sky-800 font-medium">
              {authNotice}
            </div>
          )}
          {authError && (
            <div id="auth-error-box" className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
              {authError}
            </div>
          )}

          {/* Registration Social Buttons */}
          <div className="grid grid-cols-2 gap-2">
            <button 
              id="onboarding-google-btn"
              type="button" 
              onClick={() => {
                setEmailText('f.delio@truek.com');
                addLog('Social-Auth: Simulación de Google OAuth activada', { email: 'f.delio@truek.com' });
              }}
              className="flex items-center justify-center gap-2 py-2 px-3 border border-border rounded-xl hover:bg-bg-soft hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-200 ease-bounce font-sans text-xs font-semibold text-ink">
              <img 
                alt="Google" 
                className="w-4 h-4 rounded" 
                src="https://lh3.googleusercontent.com/aida-public/AB6AXuCd7P411dW60dnBGsYyBnUMRWypgzLKZ9IuNS4tn65pvDCVetuvSR1XMzXzaWhw5yDvKVc44Uf0HLxKLK-gx3lIosmITs8kqOYHiFgoyphXp4H8vEWWBWy4M-cgMG9bH8ZFkdcm-qmcEA3xIORNONznwADoNtEtw-yLqg7Ze-wB0aTgLUnIxp7EhS9sr_HJHxfejLGZWJVKOKIPFa4ew8Nnm546oMJdhGuG6crRGGdwMb0OWCxkLnCq" 
              />
              <span>Google</span>
            </button>
            <button 
              id="onboarding-apple-btn"
              type="button" 
              onClick={() => {
                setEmailText('apple.user@icloud.com');
                addLog('Social-Auth: Simulación de Apple ID activada', { email: 'apple.user@icloud.com' });
              }}
              className="flex items-center justify-center gap-2 py-2 px-3 bg-plum text-white rounded-xl hover:opacity-90 hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-200 ease-bounce font-sans text-xs font-semibold">
              <span className="material-symbols-rounded text-[16px] text-white">apps</span>
              <span>Apple</span>
            </button>
          </div>

          <div className="relative flex items-center justify-center">
            <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-border/50"></div></div>
            <span className="relative bg-bg-soft px-2 text-[10px] font-bold text-ink-soft uppercase tracking-wider">O utiliza tu email</span>
          </div>

          {/* Onboarding Credentials Form */}
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="onboarding-email-input">
                {authMode === 'signup' ? 'Correo electrónico' : 'Email o nombre de usuario'}
              </label>
              <input
                id="onboarding-email-input"
                name="email"
                type={authMode === 'signup' ? 'email' : 'text'}
                value={emailText}
                onChange={(e) => setEmailText(e.target.value)}
                placeholder={authMode === 'signup' ? 'ejemplo@correo.com' : 'ejemplo@correo.com o tu_usuario'}
                required
                className="w-full px-4 py-2 text-sm bg-bg-soft border border-transparent rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all placeholder:text-ink-soft/55 text-ink"
              />
            </div>

            {authMode === 'signup' && (
              <div>
                <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="onboarding-username-input">
                  Nombre de usuario (opcional)
                </label>
                <input
                  id="onboarding-username-input"
                  name="username"
                  type="text"
                  value={usernameText}
                  onChange={(e) => setUsernameText(normalizeUsername(e.target.value))}
                  placeholder="Si lo dejás vacío, usamos el inicio de tu mail"
                  maxLength={20}
                  className="w-full px-4 py-2 text-sm bg-bg-soft border border-transparent rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all placeholder:text-ink-soft/55 text-ink"
                />
                {usernameText.trim().length > 0 && (
                  <p
                    className={`mt-1 text-[10px] font-semibold ${
                      usernameStatus === 'available'
                        ? 'text-primary'
                        : usernameStatus === 'taken' || usernameStatus === 'invalid'
                        ? 'text-red-600'
                        : 'text-ink-soft'
                    }`}>
                    {usernameStatus === 'checking' && 'Comprobando disponibilidad...'}
                    {usernameStatus === 'available' && '¡Disponible!'}
                    {usernameStatus === 'taken' && 'Ese nombre de usuario ya está en uso.'}
                    {usernameStatus === 'invalid' && 'Usá 3 a 20 letras minúsculas, números o guión bajo.'}
                  </p>
                )}
              </div>
            )}

            <div>
              <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="onboarding-pass-input">Contraseña</label>
              <div className="relative">
                <input 
                  id="onboarding-pass-input"
                  name="password"
                  type={isPasswordVisible ? 'text' : 'password'} 
                  value={passwordText}
                  onChange={(e) => setPasswordText(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  required
                  className="w-full px-4 py-2 text-sm bg-bg-soft border border-transparent rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all placeholder:text-ink-soft/55 text-ink"
                />
                <button 
                  id="onboarding-toggle-pass-visibility"
                  type="button" 
                  onClick={() => setIsPasswordVisible(!isPasswordVisible)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink active:scale-90 transition-all">
                  <span className="material-symbols-rounded text-[18px]">
                    {isPasswordVisible ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>

            {authMode === 'signup' && (
              <label className="flex items-start gap-2 pt-1 cursor-pointer select-none">
                <input
                  id="onboarding-accept-guidelines-checkbox"
                  type="checkbox"
                  checked={acceptedGuidelines}
                  onChange={(e) => setAcceptedGuidelines(e.target.checked)}
                  className="mt-0.5 w-3.5 h-3.5 accent-primary shrink-0"
                />
                <span className="text-[10.5px] text-ink-soft leading-snug">
                  Leí y acepto las{' '}
                  <button
                    id="onboarding-open-guidelines-btn"
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      setShowGuidelinesModal(true);
                    }}
                    className="font-bold text-primary hover:underline">
                    Normas de la comunidad
                  </button>{' '}
                  de TrueK.
                </span>
              </label>
            )}
          </form>

          {/* Interactive Geolocation Widget */}
          <div className="p-3 bg-plum-light border border-plum/30 rounded-xl shadow-sm hover:shadow transition-all space-y-2">
            <div className="flex items-center gap-3">
              <div className="relative w-12 h-12 rounded-lg overflow-hidden bg-border shrink-0 border border-gold-border">
                <img
                  alt="Map macro focus"
                  className="w-full h-full object-cover grayscale brightness-110"
                  src="https://lh3.googleusercontent.com/aida-public/AB6AXuCHTIbtgzbZf2SgIMYJCbc3S4uhLKW7VMiF9GbnjokPvMzkVLHvbH4sP4fbS5EkokaFt6vE_edtHb4at5mOOm_PDLeQmn74TDKCNOvvH5GDfG3ZQnvI2kj2t9GdddHgkUGYbXvvyXUpaIlswz-la0im9nSI69YmArHdfo7FQRBM2v5M6wLibPnHqkAp9pM1IG_P_uKEg3GRRVKQ1k3VuD2d1-l9UJUCjWK0h27P0BOAmWeiQh6MVS0I"
                />
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-warning rounded-full animate-ping absolute"></div>
                  <div className="w-2.5 h-2.5 bg-warning rounded-full shadow-[0_0_8px_rgba(185,121,30,0.8)]"></div>
                </div>
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-bold text-primary tracking-wider uppercase">Zona de Trueque</span>
                  <span className="text-[10px] text-primary font-semibold">
                    {onboardingState.locationStatus === 'detected' ? 'GPS real' : onboardingState.locationStatus === 'manual' ? 'Manual' : '...'}
                  </span>
                </div>

                {onboardingState.locationStatus === 'detecting' ? (
                  <div className="flex items-center gap-2 mt-0.5">
                    <div className="w-3 h-3 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
                    <p className="text-xs text-ink font-semibold animate-pulse">Pidiendo tu ubicación real...</p>
                  </div>
                ) : (
                  <h4 id="onboarding-location-display" className="text-sm font-extrabold text-ink truncate">
                    {onboardingState.locationText || 'No detectada'}
                  </h4>
                )}

                <div className="flex items-center gap-1 mt-1">
                  <span className="material-symbols-rounded text-[13px] text-primary">location_on</span>
                  <span className="text-[10px] text-primary font-semibold">
                    {onboardingState.locationStatus === 'manual'
                      ? 'Sin coordenadas: la distancia va a quedar desconocida'
                      : onboardingState.locationStatus === 'detected'
                      ? 'Ubicación real detectada vía GPS del navegador'
                      : 'Buscando tu ubicación real...'}
                  </span>
                </div>
              </div>
            </div>

            {onboardingState.locationStatus === 'manual' && (
              <div className="pt-2 border-t border-gold-border/60 space-y-1.5">
                {onboardingState.locationError && (
                  <p className="text-[10px] text-gold-dark">{onboardingState.locationError}</p>
                )}
                <input
                  id="onboarding-location-manual-input"
                  type="text"
                  value={onboardingState.locationText}
                  onChange={(e) => handleManualLocationChange(e.target.value)}
                  placeholder="Escribí tu ciudad (ej. Buenos Aires, Argentina)"
                  className="w-full px-3 py-1.5 text-xs bg-white border border-gold-border rounded-lg focus:ring-2 focus:ring-primary focus:outline-none text-ink"
                />
                <button
                  id="onboarding-retry-location-btn"
                  type="button"
                  onClick={handleRetryLocation}
                  className="text-[10px] font-bold text-primary hover:underline flex items-center gap-1">
                  <span className="material-symbols-rounded text-[12px]">refresh</span>
                  Reintentar detección automática
                </button>
              </div>
            )}
          </div>

          {/* Interests Chip Toggles */}
          <div>
            <h3 className="block text-[11px] font-semibold text-ink-soft mb-2">¿Qué te interesa intercambiar o donar?</h3>
            <div className="flex flex-wrap gap-1.5">
              {INITIAL_INTERESTS.map((interest) => {
                const isActive = onboardingState.selectedInterests.includes(interest);
                return (
                  <button
                    id={`interest-chip-${interest.toLowerCase().replace(' ', '-')}`}
                    key={interest}
                    type="button"
                    onClick={() => handleInterestToggle(interest)}
                    className={`px-3 py-1 text-[11px] font-semibold rounded-full border transition-all duration-200 ease-bounce active:scale-90 hover:-rotate-2 hover:scale-105 ${
                      isActive
                        ? 'bg-primary text-primary-light border-primary shadow-sm font-bold scale-105'
                        : 'bg-bg-soft text-ink-soft border-border hover:border-primary'
                    }`}>
                    {interest}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Action Button CTA */}
        <div className="pt-4 mt-4 border-t border-bg-soft space-y-2">
          <button
            id="onboarding-submit-btn"
            type="button"
            disabled={!isFormValid || onboardingState.locationStatus === 'detecting' || isSubmitting}
            onClick={handleSubmit}
            className={`group w-full py-3 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transform transition-all duration-200 ease-bounce flex items-center justify-center gap-2 shadow-md ${
              (!isFormValid || onboardingState.locationStatus === 'detecting' || isSubmitting) ? 'opacity-50 cursor-not-allowed' : ''
            }`}>
            <span>{authMode === 'signup' ? 'Crear cuenta' : 'Iniciar sesión'}</span>
            <span className="material-symbols-rounded text-[16px] transition-transform duration-200 group-hover:translate-x-1">arrow_forward</span>
          </button>

          <button
            id="onboarding-toggle-mode-btn"
            type="button"
            onClick={() => {
              setAuthError(null);
              setAuthNotice(null);
              setUsernameText('');
              setUsernameStatus('idle');
              setAuthMode(prev => (prev === 'signup' ? 'signin' : 'signup'));
            }}
            className="w-full text-center text-[11px] font-semibold text-primary hover:underline py-1">
            {authMode === 'signup' ? '¿Ya tenés cuenta? Iniciar sesión' : '¿No tenés cuenta? Crear una'}
          </button>
        </div>
      </section>

      {/* Loading Overlay */}
      {isSubmitting && (
        <div id="onboarding-loading-overlay" className="absolute inset-0 z-40 bg-bg-soft/95 backdrop-blur-md flex flex-col items-center justify-center p-6 text-center">
          <div className="w-12 h-12 border-[4px] border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="font-display text-lg font-black text-ink leading-tight">
            {authMode === 'signup' ? 'Creando tu cuenta...' : 'Iniciando sesión...'}
          </h3>
          <p className="text-xs text-ink-soft mt-1 max-w-xs">
            {authMode === 'signup'
              ? 'Creando tu cuenta real en Supabase y preparando tu perfil con 100 créditos iniciales.'
              : 'Verificando tus credenciales con Supabase Auth.'}
          </p>

          <div className="w-32 h-[3px] bg-border rounded-full mt-4 overflow-hidden relative">
            <div className="absolute top-0 bottom-0 left-0 bg-primary animate-[shimmer_1.5s_infinite] w-12" style={{ animationTimingFunction: 'linear' }} />
          </div>
        </div>
      )}

      {showGuidelinesModal && (
        <GuidelinesView
          onAccept={() => {
            setAcceptedGuidelines(true);
            setShowGuidelinesModal(false);
          }}
        />
      )}
    </div>
  );
}
