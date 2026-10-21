/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import TruekMascot from './TruekMascot';
import { Profile } from '../types';
import { updateProfileInfo, updateProfileLocation, uploadAvatar } from '../lib/profile';
import { requestBrowserLocation, reverseGeocode, forwardGeocode } from '../lib/geo';
import { fetchRatingSummary, fetchReceivedRatings, RatingSummary, ReceivedRating } from '../lib/ratings';
import { fetchMyBlockedUsers, unblockUser, BlockedUser } from '../lib/blocks';
import { normalizeUsername, isValidUsernameFormat, isUsernameAvailable } from '../lib/username';
import { deleteMyAccount } from '../lib/account';

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';

interface ProfileViewProps {
  profile: Profile | null;
  userId: string;
  onProfileUpdated: () => void | Promise<void>;
  onSignOut: () => void;
  onOpenGuidelines: () => void;
  onOpenModeration: () => void;
  addLog: (title: string, data: any) => void;
}

export default function ProfileView({
  profile,
  userId,
  onProfileUpdated,
  onSignOut,
  onOpenGuidelines,
  onOpenModeration,
  addLog,
}: ProfileViewProps) {
  const [displayNameInput, setDisplayNameInput] = useState('');
  const [bioInput, setBioInput] = useState('');
  const [usernameInput, setUsernameInput] = useState('');
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid' | 'unchanged'>('idle');
  const hasLoadedProfileRef = useRef(false);

  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [infoError, setInfoError] = useState<string | null>(null);
  const [infoSavedAt, setInfoSavedAt] = useState<number | null>(null);

  const [isUpdatingLocationGps, setIsUpdatingLocationGps] = useState(false);
  const [manualLocationQuery, setManualLocationQuery] = useState('');
  const [isSearchingLocation, setIsSearchingLocation] = useState(false);
  const [locationError, setLocationError] = useState<string | null>(null);

  const avatarInputRef = useRef<HTMLInputElement>(null);

  // Popup con la explicación completa de "¿Cuánto vale un crédito?" — lo
  // pidieron más visible, así que ahora el cartel del perfil es un botón
  // grande que abre esto, en vez de solo un texto chiquito.
  const [showCreditsInfoModal, setShowCreditsInfoModal] = useState(false);

  // Reputación real: promedio + cantidad de calificaciones que otros
  // usuarios dejaron sobre esta persona después de trueques cerrados.
  const [ratingSummary, setRatingSummary] = useState<RatingSummary>({ average: null, total: 0 });
  const [receivedRatings, setReceivedRatings] = useState<ReceivedRating[]>([]);
  const [ratingsLoading, setRatingsLoading] = useState(false);

  // Usuarios que esta persona bloqueó, para poder desbloquearlos desde acá.
  const [blockedUsers, setBlockedUsers] = useState<BlockedUser[]>([]);
  const [blockedUsersLoading, setBlockedUsersLoading] = useState(false);

  // Borrar cuenta: pide confirmación escribiendo el propio nombre de
  // usuario antes de habilitar el botón final, porque es irreversible.
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deleteConfirmInput, setDeleteConfirmInput] = useState('');
  const [isDeletingAccount, setIsDeletingAccount] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null);

  const handleDeleteAccount = async () => {
    setIsDeletingAccount(true);
    setDeleteAccountError(null);
    const { error } = await deleteMyAccount();
    if (error) {
      setDeleteAccountError(error);
      setIsDeletingAccount(false);
      addLog('Perfil: error al eliminar la cuenta', { message: error });
      return;
    }
    addLog('Perfil: cuenta eliminada por el usuario', {});
    // No hace falta resetear estado local acá: deleteMyAccount ya cerró la
    // sesión, y App.tsx escucha onAuthStateChange y manda a onboarding solo.
  };
  const [unblockingId, setUnblockingId] = useState<string | null>(null);
  const [unblockError, setUnblockError] = useState<string | null>(null);

  const refreshBlockedUsers = () => {
    if (!userId) return;
    setBlockedUsersLoading(true);
    fetchMyBlockedUsers(userId).then(({ blocked, error }) => {
      setBlockedUsersLoading(false);
      if (error) {
        addLog('Perfil: error al cargar tus usuarios bloqueados', { message: error });
        return;
      }
      setBlockedUsers(blocked);
    });
  };

  useEffect(() => {
    refreshBlockedUsers();
  }, [userId]);

  const handleUnblock = async (blockedId: string) => {
    if (!userId || unblockingId) return;
    setUnblockingId(blockedId);
    setUnblockError(null);
    const { error } = await unblockUser(userId, blockedId);
    setUnblockingId(null);
    if (error) {
      setUnblockError('No se pudo desbloquear. Probá de nuevo.');
      addLog('Perfil: error al desbloquear usuario', { message: error });
      return;
    }
    addLog('Perfil: usuario desbloqueado desde Mi Perfil', { blockedId });
    setBlockedUsers((prev) => prev.filter((b) => b.id !== blockedId));
  };

  useEffect(() => {
    if (!userId) return;
    setRatingsLoading(true);
    Promise.all([fetchRatingSummary(userId), fetchReceivedRatings(userId)]).then(
      ([{ summary, error: summaryError }, { ratings, error: ratingsError }]) => {
        setRatingsLoading(false);
        if (summaryError) addLog('Perfil: error al cargar el resumen real de calificaciones', { message: summaryError });
        if (ratingsError) addLog('Perfil: error al cargar las calificaciones reales recibidas', { message: ratingsError });
        setRatingSummary(summary);
        setReceivedRatings(ratings);
      }
    );
  }, [userId]);

  // Carga nombre/bio reales del perfil en el formulario UNA sola vez
  // (cuando el perfil llega por primera vez) — así, si después guardamos
  // y el perfil se refresca, no pisamos lo que el usuario esté escribiendo.
  useEffect(() => {
    if (!profile || hasLoadedProfileRef.current) return;
    setDisplayNameInput(profile.display_name ?? '');
    setBioInput(profile.bio ?? '');
    setUsernameInput(profile.username ?? '');
    hasLoadedProfileRef.current = true;
  }, [profile]);

  // Chequeo en vivo (con debounce) de disponibilidad del nuevo username,
  // ignorando el caso "no cambió nada" (no tiene sentido avisar que su
  // propio username ya está en uso).
  useEffect(() => {
    const trimmed = usernameInput.trim();
    if (trimmed.length === 0) {
      setUsernameStatus('invalid');
      return;
    }
    const normalized = normalizeUsername(trimmed);
    if (profile?.username && normalized === profile.username) {
      setUsernameStatus('unchanged');
      return;
    }
    if (!isValidUsernameFormat(normalized)) {
      setUsernameStatus('invalid');
      return;
    }
    setUsernameStatus('checking');
    let cancelled = false;
    const timer = setTimeout(async () => {
      const { available, error } = await isUsernameAvailable(normalized, userId);
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
  }, [usernameInput, profile?.username, userId]);

  const handleAvatarFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !userId) return;

    setAvatarError(null);
    setIsUploadingAvatar(true);
    try {
      const { url, error } = await uploadAvatar(userId, file);
      if (error || !url) {
        setAvatarError(error ?? 'No se pudo subir la foto. Intentá de nuevo.');
        addLog('Perfil: error al subir foto de perfil', { message: error });
        return;
      }
      addLog('Perfil: foto de perfil real subida y guardada en Supabase.', { url });
      await onProfileUpdated();
    } catch (err: any) {
      setAvatarError('Ocurrió un error inesperado al subir la foto. Intentá de nuevo.');
      addLog('Perfil: excepción inesperada al subir foto de perfil', { message: err?.message ?? String(err) });
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleSaveInfo = async () => {
    if (!userId || displayNameInput.trim().length === 0) return;
    if (usernameStatus !== 'unchanged' && usernameStatus !== 'available') return;

    const normalizedUsername = normalizeUsername(usernameInput.trim());

    setInfoError(null);
    setIsSavingInfo(true);
    try {
      const { error } = await updateProfileInfo(userId, {
        displayName: displayNameInput.trim(),
        bio: bioInput.trim() || null,
        ...(usernameStatus === 'available' ? { username: normalizedUsername } : {}),
      });

      if (error) {
        setInfoError(error);
        addLog('Perfil: error al guardar nombre/bio/username', { message: error });
        return;
      }

      addLog('Perfil: nombre/bio/username reales actualizados en Supabase.', {
        displayName: displayNameInput.trim(),
        username: normalizedUsername,
      });
      await onProfileUpdated();
      setInfoSavedAt(Date.now());
      setTimeout(() => setInfoSavedAt(null), 2500);
    } catch (err: any) {
      setInfoError('Ocurrió un error inesperado al guardar. Intentá de nuevo.');
      addLog('Perfil: excepción inesperada al guardar nombre/bio', { message: err?.message ?? String(err) });
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleUseGpsLocation = async () => {
    if (!userId) return;

    setLocationError(null);
    setIsUpdatingLocationGps(true);
    try {
      const { coords, error } = await requestBrowserLocation();
      if (!coords) {
        setLocationError(error ?? 'No se pudo obtener tu ubicación.');
        addLog('Perfil: no se pudo detectar ubicación real por GPS', { message: error });
        return;
      }

      const place = await reverseGeocode(coords);
      const label = place ?? `Ubicación detectada (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`;

      const { error: updateError } = await updateProfileLocation(userId, label, coords.lat, coords.lng);
      if (updateError) {
        setLocationError(updateError);
        addLog('Perfil: error al guardar ubicación real (GPS)', { message: updateError });
        return;
      }

      addLog('Perfil: ubicación real actualizada con GPS del navegador.', { lat: coords.lat, lng: coords.lng, label });
      await onProfileUpdated();
    } catch (err: any) {
      setLocationError('Ocurrió un error inesperado al actualizar tu ubicación.');
      addLog('Perfil: excepción inesperada al actualizar ubicación por GPS', { message: err?.message ?? String(err) });
    } finally {
      setIsUpdatingLocationGps(false);
    }
  };

  const handleSearchLocation = async () => {
    if (!userId || manualLocationQuery.trim().length === 0) return;

    setLocationError(null);
    setIsSearchingLocation(true);
    try {
      const result = await forwardGeocode(manualLocationQuery);
      if (!result) {
        setLocationError('No encontramos esa dirección. Probá con otra búsqueda o usá tu GPS actual.');
        addLog('Perfil: búsqueda de ubicación manual sin resultados', { query: manualLocationQuery });
        return;
      }

      const { error: updateError } = await updateProfileLocation(userId, result.label, result.coords.lat, result.coords.lng);
      if (updateError) {
        setLocationError(updateError);
        addLog('Perfil: error al guardar ubicación real (búsqueda manual)', { message: updateError });
        return;
      }

      addLog('Perfil: ubicación real actualizada por búsqueda de dirección.', {
        query: manualLocationQuery,
        label: result.label,
      });
      setManualLocationQuery('');
      await onProfileUpdated();
    } catch (err: any) {
      setLocationError('Ocurrió un error inesperado al buscar esa ubicación.');
      addLog('Perfil: excepción inesperada al buscar ubicación manual', { message: err?.message ?? String(err) });
    } finally {
      setIsSearchingLocation(false);
    }
  };

  return (
    <div className="relative flex flex-col flex-1 w-full bg-canvas md:rounded-2xl md:border md:border-border md:shadow-sm overflow-y-auto p-5">
      {/* Blob decorativo detrás del encabezado, igual que en el resto de las pantallas */}
      <div aria-hidden="true" className="absolute top-3 right-3 w-20 h-20 bg-violet-vivid/20 blob-shape-3 pointer-events-none z-0" />

      {/* Top Header */}
      <div className="relative z-10 flex justify-between items-center pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 transition-transform duration-300 ease-bounce hover:-rotate-6 hover:scale-110">
            <span className="material-symbols-rounded text-[18px] text-primary">badge</span>
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-primary-dark leading-none mb-1">Mi Perfil</h2>
            <p className="text-xs text-ink-soft">Tu información real, visible para la comunidad de TrueK</p>
          </div>
        </div>
      </div>

      {/* Avatar + nombre + créditos */}
      <div className="flex items-center gap-4 mt-5">
        <div className="relative group shrink-0">
          <input
            ref={avatarInputRef}
            id="profile-avatar-input"
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={handleAvatarFileSelected}
          />
          <button
            id="profile-avatar-upload-btn"
            type="button"
            disabled={isUploadingAvatar}
            onClick={() => avatarInputRef.current?.click()}
            className="relative block active:scale-95 hover:scale-105 hover:rotate-3 transition-all duration-200 ease-bounce">
            <img
              alt="Tu foto de perfil"
              src={profile?.avatar_url || DEFAULT_AVATAR}
              className="w-20 h-20 rounded-full object-cover border-2 border-primary/30 shadow-sm"
            />
            <div className="absolute inset-0 bg-black/50 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity duration-200">
              {isUploadingAvatar ? (
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              ) : (
                <span className="material-symbols-rounded text-white text-[18px]">photo_camera</span>
              )}
            </div>
          </button>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-black text-ink truncate">{profile?.display_name || 'Usuario TrueK'}</p>
          {profile?.username && <p className="text-[11px] font-bold text-primary truncate">@{profile.username}</p>}
          <p className="text-[11px] text-ink-soft mt-0.5 truncate">{profile?.location || 'Sin ubicación guardada'}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <div className="inline-flex items-center gap-1 bg-primary/10 text-primary text-[11px] font-extrabold px-2 py-0.5 rounded-full">
              <span className="material-symbols-rounded text-[13px]">paid</span>
              {profile?.credits ?? 0} créditos
            </div>
            {!!profile?.credits_held && profile.credits_held > 0 && (
              <div
                id="profile-credits-held-badge"
                title="Créditos que ofreciste en un trueque aceptado, en espera de que se confirme la entrega"
                className="inline-flex items-center gap-1 bg-plum-light text-primary text-[11px] font-extrabold px-2 py-0.5 rounded-full">
                <span className="material-symbols-rounded text-[13px]">hourglass_empty</span>
                {profile.credits_held} en espera
              </div>
            )}
            <div id="profile-rating-badge" className="inline-flex items-center gap-1 bg-plum-light text-primary text-[11px] font-extrabold px-2 py-0.5 rounded-full">
              <span className="material-symbols-rounded text-[13px]">star</span>
              {ratingSummary.average != null ? ratingSummary.average.toFixed(1) : 'Sin calificar'}
              {ratingSummary.total > 0 && <span className="text-primary font-semibold">({ratingSummary.total})</span>}
            </div>
          </div>
        </div>
      </div>

      {/* Valor de referencia de los créditos: antes era un cartel chico y
          pasaba desapercibido, así que ahora es un botón grande y
          llamativo que abre la explicación completa en un popup. */}
      <button
        id="profile-credits-reference-note"
        type="button"
        onClick={() => setShowCreditsInfoModal(true)}
        className="mt-3 w-full p-4 bg-plum-light border-2 border-plum/40 rounded-xl flex items-center gap-3 text-left hover:border-plum active:scale-[0.98] transition-all">
        <span className="material-symbols-rounded text-[26px] text-primary shrink-0">lightbulb</span>
        <div className="flex-1">
          <p className="text-sm font-black text-primary leading-tight">¿Cuánto vale un crédito?</p>
          <p className="text-[11px] text-primary/80 leading-snug mt-0.5">Tocá para ver la guía de referencia</p>
        </div>
        <span className="material-symbols-rounded text-[18px] text-primary shrink-0">chevron_right</span>
      </button>

      {showCreditsInfoModal && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
          onClick={() => setShowCreditsInfoModal(false)}>
          <div
            id="credits-info-modal"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-5 w-full max-w-sm shadow-xl space-y-3">
            <div className="flex items-start gap-2">
              <span className="material-symbols-rounded text-[28px] text-primary shrink-0">lightbulb</span>
              <h2 className="font-display text-lg font-black text-ink-dark leading-tight">¿Cuánto vale un crédito?</h2>
            </div>
            <p className="text-sm text-ink leading-relaxed">
              Como referencia, 1 crédito ≈ el valor de un litro de nafta súper. Te suscribís con 100, así que esto te
              sirve de guía para ofertar con sentido:
            </p>
            <ul className="text-sm text-ink leading-relaxed list-disc pl-5 space-y-1">
              <li>Objetos chicos: 5 a 15 créditos</li>
              <li>Objetos medianos: 20 a 50 créditos</li>
              <li>Objetos grandes o de alto valor: 60 a 150 créditos o más</li>
            </ul>
            <p className="text-[11px] text-ink-soft leading-relaxed">
              No es un tipo de cambio fijo, solo una ayuda para que las ofertas sean razonables.
            </p>
            <button
              type="button"
              onClick={() => setShowCreditsInfoModal(false)}
              className="mt-1 w-full py-2.5 bg-primary text-white rounded-xl font-bold text-xs hover:bg-primary-dark active:scale-95 transition-all">
              Entendido
            </button>
          </div>
        </div>
      )}

      {avatarError && (
        <p id="profile-avatar-error" className="mt-2 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {avatarError}
        </p>
      )}

      {/* Nombre y bio */}
      <div className="mt-5 p-4 rounded-xl border border-border/30 bg-white shadow-sm space-y-3">
        <span className="block text-[11px] font-bold text-ink-soft uppercase tracking-wide">Información</span>

        <div>
          <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="profile-name-input">
            Nombre
          </label>
          <input
            id="profile-name-input"
            type="text"
            value={displayNameInput}
            onChange={(e) => setDisplayNameInput(e.target.value)}
            maxLength={60}
            placeholder="Tu nombre o apodo"
            className="w-full px-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
          />
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="profile-username-input">
            Nombre de usuario
          </label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft text-sm font-bold">@</span>
            <input
              id="profile-username-input"
              type="text"
              value={usernameInput}
              onChange={(e) => setUsernameInput(normalizeUsername(e.target.value))}
              maxLength={20}
              placeholder="tu_usuario"
              className="w-full pl-7 pr-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
            />
          </div>
          {usernameStatus !== 'unchanged' && (
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
          <p className="mt-1 text-[10px] text-ink-soft">Con este nombre también podés iniciar sesión, además de con tu mail.</p>
        </div>

        <div>
          <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="profile-bio-input">
            Sobre vos (opcional)
          </label>
          <textarea
            id="profile-bio-input"
            value={bioInput}
            onChange={(e) => setBioInput(e.target.value)}
            rows={3}
            maxLength={280}
            placeholder="Contale a la comunidad qué sueles truequear o donar..."
            className="w-full px-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
          />
        </div>

        {infoError && (
          <p id="profile-info-error" className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
            {infoError}
          </p>
        )}

        <div className="flex items-center gap-2">
          <button
            id="profile-save-info-btn"
            type="button"
            disabled={
              isSavingInfo ||
              displayNameInput.trim().length === 0 ||
              (usernameStatus !== 'unchanged' && usernameStatus !== 'available')
            }
            onClick={handleSaveInfo}
            className="flex-1 bg-primary text-white py-2 rounded-xl font-bold text-xs hover:bg-primary-dark hover:-translate-y-0.5 hover:shadow-md active:scale-95 transition-all duration-200 ease-bounce disabled:opacity-50">
            {isSavingInfo ? 'Guardando...' : 'Guardar cambios'}
          </button>
          {infoSavedAt !== null && (
            <span className="text-[10px] font-bold text-primary flex items-center gap-1 whitespace-nowrap">
              <span className="material-symbols-rounded text-[14px]">check_circle</span>
              Guardado
            </span>
          )}
        </div>
      </div>

      {/* Ubicación */}
      <div className="mt-4 p-4 rounded-xl border border-border/30 bg-white shadow-sm space-y-3">
        <div>
          <span className="block text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-1">Tu ubicación</span>
          <p className="text-[10px] text-ink-soft">Se usa para calcular distancias reales en el Catálogo.</p>
        </div>

        <div className="flex items-center justify-between gap-2 bg-bg-soft rounded-lg px-3 py-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-rounded text-[14px] text-primary">location_on</span>
            <span className="text-[11px] font-semibold text-ink truncate">
              {profile?.location || 'Sin ubicación guardada'}
            </span>
          </div>
          {profile?.lat == null && (
            <span className="text-[9px] font-bold text-gold-dark whitespace-nowrap shrink-0">Sin coordenadas</span>
          )}
        </div>

        <button
          id="profile-use-gps-btn"
          type="button"
          disabled={isUpdatingLocationGps}
          onClick={handleUseGpsLocation}
          className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bg-soft text-ink text-[11px] font-bold hover:bg-border hover:-translate-y-0.5 disabled:opacity-60 transition-all duration-200 ease-bounce">
          <span className="material-symbols-rounded text-[14px]">my_location</span>
          {isUpdatingLocationGps ? 'Detectando...' : 'Actualizar con mi GPS actual'}
        </button>

        <div className="flex gap-1.5">
          <input
            id="profile-location-search-input"
            type="text"
            value={manualLocationQuery}
            onChange={(e) => setManualLocationQuery(e.target.value)}
            placeholder="O escribí tu ciudad/zona"
            className="flex-1 px-3 py-1.5 text-[11px] bg-bg-soft border-none rounded-lg focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none text-ink"
          />
          <button
            id="profile-location-search-btn"
            type="button"
            disabled={isSearchingLocation || manualLocationQuery.trim().length === 0}
            onClick={handleSearchLocation}
            className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold disabled:opacity-50 hover:bg-primary-dark hover:scale-105 active:scale-95 transition-all duration-200 ease-bounce">
            {isSearchingLocation ? '...' : 'Buscar'}
          </button>
        </div>

        {locationError && <p className="text-[10px] text-red-600">{locationError}</p>}
      </div>

      {/* Calificaciones reales recibidas de otros usuarios, después de
          trueques cerrados de verdad */}
      <div className="mt-4 p-4 rounded-xl border border-border/30 bg-white shadow-sm space-y-2">
        <span className="block text-[11px] font-bold text-ink-soft uppercase tracking-wide">
          Mis calificaciones {ratingSummary.total > 0 && `(${ratingSummary.total})`}
        </span>

        {ratingsLoading && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!ratingsLoading && receivedRatings.length === 0 && (
          <div className="flex flex-col items-center text-center py-2">
            <TruekMascot className="w-14 h-14 mb-1.5 animate-truek-float" />
            <p className="text-[10px] text-ink-soft">
              Todavía no recibiste calificaciones. Van a aparecer acá después de que cierres un trueque.
            </p>
          </div>
        )}

        {!ratingsLoading && receivedRatings.length > 0 && (
          <div id="profile-received-ratings-list" className="space-y-2">
            {receivedRatings.map((r) => (
              <div key={r.id} className="flex items-start gap-2 bg-bg-soft rounded-lg p-2.5 transition-all duration-200 ease-bounce hover:shadow-sm hover:-translate-y-0.5">
                <img
                  alt={r.raterName}
                  src={r.raterAvatar || DEFAULT_AVATAR}
                  className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-bold text-ink truncate">{r.raterName}</span>
                    <span className="flex items-center gap-0.5 shrink-0">
                      {[1, 2, 3, 4, 5].map((n) => (
                        <span
                          key={n}
                          className={`material-symbols-rounded text-[11px] ${n <= r.stars ? 'text-gold-dark' : 'text-ink-faint'}`}
                          style={{ fontVariationSettings: n <= r.stars ? "'FILL' 1" : "'FILL' 0" }}>
                          star
                        </span>
                      ))}
                    </span>
                  </div>
                  {r.comment && <p className="text-[10px] text-ink-soft mt-0.5">{r.comment}</p>}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usuarios que esta persona bloqueó, con opción de desbloquear */}
      {(blockedUsersLoading || blockedUsers.length > 0) && (
        <div className="mt-4 p-4 rounded-xl border border-border/30 bg-white shadow-sm space-y-2">
          <span className="block text-[11px] font-bold text-ink-soft uppercase tracking-wide">
            Cuentas bloqueadas {blockedUsers.length > 0 && `(${blockedUsers.length})`}
          </span>

          {blockedUsersLoading && (
            <div className="flex justify-center py-3">
              <div className="w-5 h-5 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {unblockError && <p className="text-[10px] font-semibold text-red-600">{unblockError}</p>}

          {!blockedUsersLoading && blockedUsers.length > 0 && (
            <div id="profile-blocked-users-list" className="space-y-2">
              {blockedUsers.map((b) => (
                <div key={b.id} className="flex items-center gap-2 bg-bg-soft rounded-lg p-2.5 transition-all duration-200 ease-bounce hover:shadow-sm hover:-translate-y-0.5">
                  <img
                    alt={b.displayName}
                    src={b.avatarUrl || DEFAULT_AVATAR}
                    className="w-7 h-7 rounded-full object-cover border border-border shrink-0"
                  />
                  <span className="text-[11px] font-bold text-ink truncate flex-1">{b.displayName}</span>
                  <button
                    id={`unblock-user-btn-${b.id}`}
                    type="button"
                    disabled={unblockingId === b.id}
                    onClick={() => handleUnblock(b.id)}
                    className="shrink-0 px-2.5 py-1 rounded-lg bg-bg-soft hover:bg-border hover:-translate-y-0.5 active:scale-95 text-ink-soft text-[10px] font-black uppercase tracking-wide disabled:opacity-60 transition-all duration-200 ease-bounce">
                    {unblockingId === b.id ? '...' : 'Desbloquear'}
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 pt-4 border-t border-border/60 space-y-1.5">
        {profile?.is_admin && (
          <button
            id="profile-open-moderation-btn"
            type="button"
            onClick={onOpenModeration}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-plum-light hover:bg-plum/20 text-plum text-xs font-bold transition-colors">
            <span className="material-symbols-rounded text-[16px]">shield_person</span>
            Panel de moderación
          </button>
        )}
        <button
          id="profile-open-guidelines-btn"
          type="button"
          onClick={onOpenGuidelines}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-bg-soft hover:bg-border text-ink-soft text-xs font-bold transition-colors">
          <span className="material-symbols-rounded text-[16px]">diversity_3</span>
          Normas de la comunidad
        </button>
      </div>

      <button
        id="profile-signout-btn"
        type="button"
        onClick={onSignOut}
        className="mt-3 w-full text-center text-[11px] font-semibold text-red-600 hover:underline py-2">
        Cerrar sesión
      </button>

      <div className="mt-6 pt-4 border-t border-border/60">
        {!showDeleteAccount ? (
          <button
            id="profile-delete-account-open-btn"
            type="button"
            onClick={() => {
              setShowDeleteAccount(true);
              setDeleteConfirmInput('');
              setDeleteAccountError(null);
            }}
            className="w-full text-center text-[10px] font-semibold text-ink-faint hover:text-red-600 hover:underline py-1 transition-colors">
            Eliminar cuenta
          </button>
        ) : (
          <div id="profile-delete-account-panel" className="bg-red-50 border border-red-200 rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-extrabold text-red-700">¿Eliminar tu cuenta de TrueK?</p>
            <p className="text-[10px] text-red-700/90 leading-snug">
              Esto borra para siempre tu perfil, tus publicaciones, tus ofertas de trueque, tus conversaciones y tus
              créditos. No se puede deshacer. Para confirmar, escribí tu nombre de usuario (
              <span className="font-bold">@{profile?.username}</span>) acá abajo:
            </p>
            <input
              id="profile-delete-account-confirm-input"
              type="text"
              value={deleteConfirmInput}
              onChange={(e) => setDeleteConfirmInput(e.target.value)}
              placeholder={profile?.username || ''}
              autoCapitalize="none"
              autoCorrect="off"
              className="w-full px-3 py-1.5 text-xs bg-white border border-red-200 rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none text-ink"
            />
            {deleteAccountError && (
              <p className="text-[10px] font-semibold text-red-700">{deleteAccountError}</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <button
                id="profile-delete-account-cancel-btn"
                type="button"
                disabled={isDeletingAccount}
                onClick={() => setShowDeleteAccount(false)}
                className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-red-200 text-ink-soft text-[10px] font-black uppercase tracking-wide hover:bg-red-50 disabled:opacity-60 transition-colors">
                Cancelar
              </button>
              <button
                id="profile-delete-account-confirm-btn"
                type="button"
                disabled={isDeletingAccount || deleteConfirmInput.trim() !== (profile?.username || '')}
                onClick={handleDeleteAccount}
                className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-40 transition-colors">
                {isDeletingAccount ? 'Eliminando...' : 'Sí, eliminar mi cuenta'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
