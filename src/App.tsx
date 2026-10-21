/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import type { Session } from '@supabase/supabase-js';
import { ScreenType, OnboardingState, PublishState, FeedItem, Profile } from './types';
import { supabase } from './lib/supabaseClient';
import { fetchActiveListings } from './lib/listings';
import { getOrCreateConversation, fetchUnreadConversationIds } from './lib/chat';
import { requestBrowserLocation, reverseGeocode } from './lib/geo';
import OnboardingView from './components/OnboardingView';
import PublishView from './components/PublishView';
import DiscoveryView from './components/DiscoveryView';
import ChatView, { ActiveChatInfo } from './components/ChatView';
import ProfileView from './components/ProfileView';
import ModerationView from './components/ModerationView';
import GuidelinesView from './components/GuidelinesView';
import TruekMascot from './components/TruekMascot';

interface LogEntry {
  id: string;
  timestamp: string;
  title: string;
  data: any;
}

// Navegación real de la app (una vez logueado): Catálogo, Publicar, Chats,
// Perfil. "onboarding" no es un destino de navegación -- es la pantalla de
// registro/login que se muestra sola, sin este menú, mientras no hay sesión.
const NAV_ITEMS: { id: ScreenType; label: string; icon: string }[] = [
  { id: 'discovery', label: 'Catálogo', icon: 'storefront' },
  { id: 'publish', label: 'Publicar', icon: 'add_circle' },
  { id: 'chat', label: 'Chats', icon: 'forum' },
  { id: 'profile', label: 'Perfil', icon: 'person' },
];

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('onboarding');

  // Log interno silencioso (ya no se muestra en ninguna pantalla -- se usa
  // solo como "console.log con historial" para debug nuestro). Se mantiene
  // porque todas las pantallas ya llaman a addLog en decenas de lugares.
  const [logs, setLogs] = useState<LogEntry[]>([]);

  const addLog = (title: string, data: any) => {
    const newLog: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      title,
      data,
    };
    setLogs((prev) => [newLog, ...prev].slice(0, 200));
  };

  // ---- Sesión real de Supabase Auth ----
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      if (!newSession) {
        setProfile(null);
        setActiveChat(null);
        setCurrentScreen('onboarding');
      }
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  const refreshProfile = async () => {
    if (!session) return;

    const { data, error } = await supabase
      .from('user_profiles')
      .select('id, username, display_name, avatar_url, bio, location, lat, lng, credits, credits_held, is_admin, is_suspended, suspended_reason')
      .eq('id', session.user.id)
      .single();

    if (error) {
      addLog('Perfil: no se pudo cargar el perfil real', { message: error.message });
      return;
    }
    setProfile(data as Profile);
    addLog('Perfil: cargado desde Supabase', { credits: data?.credits });
  };

  useEffect(() => {
    refreshProfile();
  }, [session]);

  // ---- Indicador real de "no leído" en el ícono de Chats: hay algo nuevo
  // (mensaje u oferta/contraoferta) en alguna conversación propia que
  // todavía no abriste. Se refresca solo cada tanto, y de una al tocar
  // "leído" dentro del chat (vía onUnreadStatusChanged).
  const [hasUnreadChats, setHasUnreadChats] = useState(false);

  const refreshUnreadStatus = async () => {
    if (!session) {
      setHasUnreadChats(false);
      return;
    }
    const { unreadIds, error } = await fetchUnreadConversationIds();
    if (error) {
      addLog('Negociación: error al chequear notificaciones reales', { message: error });
      return;
    }
    setHasUnreadChats(unreadIds.size > 0);
  };

  useEffect(() => {
    if (!session) {
      setHasUnreadChats(false);
      return;
    }
    refreshUnreadStatus();
    const intervalId = setInterval(refreshUnreadStatus, 25000);
    return () => clearInterval(intervalId);
  }, [session]);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    addLog('Auth: sesión cerrada por el usuario', {});
  };

  // Usada como respaldo del header cuando todavía no hay perfil cargado
  // (antes de iniciar sesión, o mientras refreshProfile está en curso).
  const DEFAULT_HEADER_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';

  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    email: '',
    locationStatus: 'idle',
    locationText: '',
    locationError: null,
    lat: null,
    lng: null,
    selectedInterests: ['Tecnología'],
    progress: 15,
  });

  const [publishState, setPublishState] = useState<PublishState>({
    listingType: 'barter',
    photos: [],
    title: '',
    description: '',
    category: '',
    exchangeType: 'objeto',
    creditValue: '',
    exchangeSearch: '',
    selectedPreferences: ['Abierto a todo'],
    status: 'idle',
    draftId: null,
    deliveryMode: 'profile',
    deliveryLat: null,
    deliveryLng: null,
    deliveryLocationLabel: null,
    deliveryNote: '',
  });

  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);

  // viewerLat/viewerLng opcionales: si no se pasan, usamos la ubicación
  // ya guardada en el perfil cargado. Permite forzar coordenadas recién
  // obtenidas (p.ej. justo después de activar la ubicación) sin esperar
  // a que el estado de "profile" se actualice primero.
  const refreshFeed = async (viewerLat?: number | null, viewerLng?: number | null) => {
    const lat = viewerLat !== undefined ? viewerLat : profile?.lat ?? null;
    const lng = viewerLng !== undefined ? viewerLng : profile?.lng ?? null;

    const { items, error } = await fetchActiveListings(lat, lng);
    if (error) {
      addLog('Catálogo: no se pudieron cargar los listings reales', { message: error });
      return;
    }
    setFeedItems(items);
    addLog('Catálogo: listings cargados desde Supabase con distancia real', {
      total: items.length,
      viewerHasLocation: lat != null && lng != null,
    });
  };

  // Al iniciar sesión (o recuperar una existente) traemos el catálogo
  // real. También lo refrescamos en cuanto el perfil termina de cargar
  // (o cambia su ubicación), para que la distancia salga bien calculada
  // desde el primer render y no se quede pegada en "desconocida".
  useEffect(() => {
    if (!session) return;
    refreshFeed();
  }, [session, profile?.lat, profile?.lng]);

  // Pide la ubicación real al navegador para una cuenta que ya existe
  // (p.ej. se registró antes de que existiera esta función, o la rechazó
  // en su momento) y la guarda en su perfil real.
  const handleUpdateMyLocation = async (): Promise<{ error: string | null }> => {
    if (!session) return { error: 'No hay sesión activa.' };

    addLog('Ubicación: pidiendo tu ubicación real al navegador...', {});
    const { coords, error } = await requestBrowserLocation();

    if (!coords) {
      addLog('Ubicación: no se pudo activar la ubicación', { message: error });
      return { error: error ?? 'No se pudo obtener tu ubicación.' };
    }

    const place = await reverseGeocode(coords);
    const locationText = place ?? `Ubicación detectada (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`;

    const { error: updateError } = await supabase
      .from('user_profiles')
      .update({ location: locationText, lat: coords.lat, lng: coords.lng })
      .eq('id', session.user.id);

    if (updateError) {
      addLog('Ubicación: error al guardar la ubicación real', { message: updateError.message });
      return { error: updateError.message };
    }

    addLog('Ubicación: activada y guardada en tu perfil real', { lat: coords.lat, lng: coords.lng, locationText });
    await refreshProfile();
    await refreshFeed(coords.lat, coords.lng); // no esperamos a que "profile" se actualice: usamos las coordenadas recién obtenidas
    return { error: null };
  };

  const [activeChat, setActiveChat] = useState<ActiveChatInfo | null>(null);

  const handleStartChat = async (item: FeedItem) => {
    if (!session) return;

    const { conversationId, error } = await getOrCreateConversation(item.id, item.sellerId, session.user.id);

    if (error || !conversationId) {
      addLog('Negociación: no se pudo abrir la conversación', { message: error });
      return;
    }

    setActiveChat({
      conversationId,
      listingId: item.id,
      buyerId: session.user.id,
      sellerId: item.sellerId,
      listingTitle: item.title,
      listingImage: item.image,
      otherUserName: item.userName,
      otherUserAvatar: item.userAvatar,
    });
    addLog('Negociación: conversación real abierta/creada', { conversationId, listing: item.title });
    handleScreenChange('chat');
  };

  const handleScreenChange = (screen: ScreenType) => {
    if (screen !== 'onboarding' && !session) {
      addLog('Navigation: bloqueado — hace falta iniciar sesión primero', { intento: screen });
      return;
    }
    setCurrentScreen(screen);
    addLog(`Navigation: Cambio manual de pantalla activa a "${screen.toUpperCase()}"`, {
      from: currentScreen,
      to: screen,
    });
  };

  if (authLoading) {
    return (
      <main className="min-h-screen bg-bg flex items-center justify-center">
        <div className="w-10 h-10 border-[4px] border-primary border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  // Sin sesión: la pantalla de registro/login ocupa toda la página, sin el
  // menú ni el header de la app real (todavía no hay nada a donde navegar).
  if (!session) {
    return (
      <main className="min-h-screen bg-bg font-sans">
        <OnboardingView
          onboardingState={onboardingState}
          setOnboardingState={setOnboardingState}
          onAdvance={() => handleScreenChange('publish')}
          addLog={addLog}
        />
      </main>
    );
  }

  // Una cuenta suspendida por moderación no puede usar la app: ni ver el
  // catálogo, ni publicar, ni chatear. Mostramos una pantalla de bloqueo
  // en vez del shell normal (igual puede cerrar sesión).
  if (profile?.is_suspended) {
    return (
      <main className="min-h-screen bg-bg flex flex-col items-center justify-center p-6 text-center">
        <TruekMascot className="w-16 h-16 mb-3" />
        <h1 className="font-display text-lg font-black text-ink-dark">Tu cuenta está suspendida</h1>
        <p className="text-xs text-ink-soft mt-2 max-w-xs">
          Un administrador suspendió temporalmente tu cuenta de TrueK
          {profile.suspended_reason ? <> por el siguiente motivo: <span className="font-semibold">{profile.suspended_reason}</span></> : '.'}{' '}
          Mientras esté suspendida no podés publicar, ofertar ni chatear.
        </p>
        <button
          type="button"
          onClick={handleSignOut}
          className="mt-5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:bg-primary-dark active:scale-95 transition-all">
          Cerrar sesión
        </button>
      </main>
    );
  }

  // Red de seguridad: si por algún instante quedó "onboarding" como
  // pantalla activa pero ya hay sesión, mostramos el Catálogo en vez de
  // una pantalla en blanco.
  const activeScreen = currentScreen === 'onboarding' ? 'discovery' : currentScreen;

  return (
    <main className="min-h-screen bg-bg text-ink font-sans flex flex-col">
      {/* Header: marca + navegación (en escritorio) + créditos/perfil */}
      <header className="relative sticky top-0 z-30 bg-primary shadow-sm overflow-hidden">
        {/* Blob decorativo: lejos del logo (a la derecha, mayormente fuera
            de cuadro) para que no compita con él ni lo tape. */}
        <div aria-hidden="true" className="absolute -top-16 -right-10 w-40 h-40 bg-violet-vivid/25 blob-shape-2 pointer-events-none z-0" />
        <div className="relative z-10 max-w-5xl mx-auto px-4 md:px-6 h-[4.5rem] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => handleScreenChange('discovery')}
            className="group flex items-center gap-2.5 shrink-0 active:scale-95 transition-transform">
            <div className="bg-white/15 border border-white/25 w-11 h-11 rounded-xl flex items-center justify-center shrink-0 transition-transform duration-300 ease-bounce group-hover:-rotate-6 group-hover:scale-110">
              <svg width="26" height="26" viewBox="0 0 24 24" aria-hidden="true">
                <polygon points="2,3 2,21 12,12" fill="#9CCB3B" />
                <polygon points="22,3 22,21 12,12" fill="#E8B923" />
              </svg>
            </div>
            <span className="font-display font-extrabold text-xl text-white">
              Tru<span className="text-canvas">e</span><span style={{ color: '#E8B923' }}>K</span>
            </span>
          </button>

          {/* Navegación horizontal — solo en pantallas anchas; en celular va abajo */}
          <nav className="hidden md:flex items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                id={`nav-btn-${item.id}`}
                type="button"
                onClick={() => handleScreenChange(item.id)}
                className={`relative px-3.5 py-2 rounded-xl text-sm font-bold flex items-center gap-1.5 transition-all duration-200 ease-bounce hover:-translate-y-0.5 ${
                  activeScreen === item.id ? 'bg-white text-primary-dark scale-105' : 'text-white/80 hover:bg-white/10'
                }`}>
                <span className="material-symbols-rounded text-[18px]">{item.icon}</span>
                <span>{item.label}</span>
                {item.id === 'chat' && hasUnreadChats && (
                  <span
                    id="chat-nav-unread-dot"
                    className="absolute top-1.5 right-2 w-2 h-2 bg-accent rounded-full border border-white animate-pulse"
                  />
                )}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-2.5 shrink-0">
            {profile && (
              <div className="hidden sm:flex items-center gap-1 bg-primary-light text-primary-dark text-xs font-extrabold px-3 py-1.5 rounded-full">
                <span className="material-symbols-rounded text-[15px]">paid</span>
                <span>{profile.credits}</span>
                {profile.credits_held > 0 && (
                  <span title="Créditos en espera por un trueque sin confirmar todavía" className="text-accent-dark">
                    +{profile.credits_held}
                  </span>
                )}
              </div>
            )}
            <button
              id="header-avatar-btn"
              type="button"
              title="Mi Perfil"
              onClick={() => handleScreenChange('profile')}
              className="relative block active:scale-95 hover:rotate-3 hover:scale-105 transition-all duration-200 ease-bounce">
              <img
                alt="Mi Perfil"
                src={profile?.avatar_url || DEFAULT_HEADER_AVATAR}
                className={`w-9 h-9 rounded-full object-cover border-2 transition-colors ${
                  activeScreen === 'profile' ? 'border-white' : 'border-white/40'
                }`}
              />
            </button>
            <button
              id="header-signout-btn"
              type="button"
              onClick={handleSignOut}
              title="Cerrar sesión"
              className="hidden sm:block text-white/70 hover:text-white active:scale-90 transition-all">
              <span className="material-symbols-rounded text-[20px]">logout</span>
            </button>
          </div>
        </div>
      </header>

      {/* Pantalla activa */}
      <div className="flex-1 w-full max-w-5xl mx-auto flex flex-col md:px-6 md:py-5 pb-16 md:pb-5">
        {activeScreen === 'publish' && (
          <PublishView
            publishState={publishState}
            setPublishState={setPublishState}
            userId={session.user.id}
            onPublished={refreshFeed}
            onAdvance={() => handleScreenChange('discovery')}
            addLog={addLog}
          />
        )}
        {activeScreen === 'discovery' && (
          <DiscoveryView
            feedItems={feedItems}
            onStartChat={handleStartChat}
            hasMyLocation={profile?.lat != null && profile?.lng != null}
            onUpdateMyLocation={handleUpdateMyLocation}
            currentUserId={session.user.id}
            addLog={addLog}
          />
        )}
        {activeScreen === 'chat' && (
          <ChatView
            initialChat={activeChat}
            onConsumeInitialChat={() => setActiveChat(null)}
            currentUserId={session.user.id}
            currentUserCredits={profile?.credits ?? 0}
            onDealClosed={() => {
              refreshProfile();
              refreshFeed();
            }}
            onUnreadStatusChanged={refreshUnreadStatus}
            addLog={addLog}
          />
        )}
        {activeScreen === 'profile' && (
          <ProfileView
            profile={profile}
            userId={session.user.id}
            onProfileUpdated={refreshProfile}
            onSignOut={handleSignOut}
            onOpenGuidelines={() => handleScreenChange('guidelines')}
            onOpenModeration={() => handleScreenChange('moderation')}
            addLog={addLog}
          />
        )}
        {activeScreen === 'moderation' && profile?.is_admin && <ModerationView addLog={addLog} />}
        {activeScreen === 'guidelines' && (
          <GuidelinesView onClose={() => handleScreenChange('profile')} />
        )}
      </div>

      {/* Navegación inferior — solo en celular/pantallas angostas */}
      <nav
        className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-surface border-t border-border"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="flex items-stretch">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              id={`mobile-nav-btn-${item.id}`}
              type="button"
              onClick={() => handleScreenChange(item.id)}
              className={`relative flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-[11px] font-bold transition-colors active:scale-90 ${
                activeScreen === item.id ? 'text-primary-dark' : 'text-ink'
              }`}>
              <span className={`material-symbols-rounded text-[22px] transition-transform duration-200 ease-bounce ${activeScreen === item.id ? 'scale-110 -translate-y-0.5' : ''}`}>{item.icon}</span>
              <span>{item.label}</span>
              {item.id === 'chat' && hasUnreadChats && (
                <span className="absolute top-1 right-[32%] w-2 h-2 bg-accent rounded-full border border-white" />
              )}
            </button>
          ))}
        </div>
      </nav>
    </main>
  );
}
