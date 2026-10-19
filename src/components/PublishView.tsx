/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { PublishState, PhotoUpload } from '../types';
import { saveListing, fetchMyDrafts, fetchMyActiveListings, deleteDraft, pauseListing, OwnedListing } from '../lib/listings';
import { supabase } from '../lib/supabaseClient';
import { requestBrowserLocation, reverseGeocode, forwardGeocode } from '../lib/geo';
import { CATEGORIES } from '../data/mockData';

interface PublishViewProps {
  publishState: PublishState;
  setPublishState: React.Dispatch<React.SetStateAction<PublishState>>;
  userId: string;
  onPublished: () => void | Promise<void>;
  onAdvance: () => void;
  addLog: (title: string, data: any) => void;
}

const BLANK_PUBLISH_STATE: PublishState = {
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
};

export default function PublishView({
  publishState,
  setPublishState,
  userId,
  onPublished,
  onAdvance,
  addLog,
}: PublishViewProps) {
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [publishError, setPublishError] = useState<string | null>(null);
  const [draftSavedAt, setDraftSavedAt] = useState<number | null>(null);
  const [drafts, setDrafts] = useState<OwnedListing[]>([]);
  const [activeListings, setActiveListings] = useState<OwnedListing[]>([]);
  const [isUnpublishingId, setIsUnpublishingId] = useState<string | null>(null);
  const [activeListingsError, setActiveListingsError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado de la sección "¿Dónde se entrega esto?"
  const [isLocatingDelivery, setIsLocatingDelivery] = useState(false);
  const [deliveryAddressQuery, setDeliveryAddressQuery] = useState('');
  const [isSearchingDeliveryAddress, setIsSearchingDeliveryAddress] = useState(false);
  const [deliveryLocationError, setDeliveryLocationError] = useState<string | null>(null);

  const refreshDrafts = useCallback(async () => {
    if (!userId) return;
    const { drafts: loaded, error } = await fetchMyDrafts(userId);
    if (!error) setDrafts(loaded);
  }, [userId]);

  const refreshActiveListings = useCallback(async () => {
    if (!userId) return;
    const { listings, error } = await fetchMyActiveListings(userId);
    if (error) {
      setActiveListingsError(error);
      return;
    }
    setActiveListingsError(null);
    setActiveListings(listings);
  }, [userId]);

  // Carga "Mis borradores" y "Mis publicaciones activas" al entrar a la
  // pantalla (y si cambia de usuario).
  useEffect(() => {
    refreshDrafts();
    refreshActiveListings();
  }, [refreshDrafts, refreshActiveListings]);

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite volver a elegir el mismo archivo si hace falta

    if (!file) return;

    if (!userId) {
      setUploadError('No se encontró tu sesión. Iniciá sesión de nuevo e intentá otra vez.');
      return;
    }

    const MAX_PHOTO_BYTES = 10 * 1024 * 1024; // 10 MB, igual al límite del bucket
    if (file.size > MAX_PHOTO_BYTES) {
      setUploadError(
        `La foto pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB y el máximo permitido es 10MB. Probá con una foto más liviana o comprimila antes de subirla.`
      );
      addLog('Posteo: Foto rechazada por tamaño antes de subir', { size_mb: (file.size / (1024 * 1024)).toFixed(1) });
      return;
    }

    setUploadError(null);
    setIsUploadingPhoto(true);
    addLog('Posteo: Subiendo foto real a Supabase Storage...', {
      fileName: file.name,
      size_kb: Math.round(file.size / 1024),
    });

    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
    const path = `${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

    const { error: uploadErr } = await supabase.storage.from('listing-images').upload(path, file, {
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadErr) {
      setIsUploadingPhoto(false);
      const msg = uploadErr.message || '';
      const friendlyMsg = /too large|EntityTooLarge|413/i.test(msg)
        ? 'La foto es demasiado pesada (máximo 10MB). Probá con otra o comprimila.'
        : /mime type|not supported|415/i.test(msg)
        ? 'Ese formato de imagen no está soportado. Usá JPG, PNG, WEBP o GIF.'
        : 'No se pudo subir la foto. Intentá de nuevo.';
      setUploadError(friendlyMsg);
      addLog('Posteo: Error al subir foto a Supabase Storage', { message: msg });
      return;
    }

    const { data: publicUrlData } = supabase.storage.from('listing-images').getPublicUrl(path);

    const newPhoto: PhotoUpload = {
      id: `photo_${Date.now()}`,
      url: publicUrlData.publicUrl,
      name: file.name,
      progress: 100,
      analyzed: true,
    };

    setPublishState((prev) => ({ ...prev, photos: [...prev.photos, newPhoto] }));
    setIsUploadingPhoto(false);
    addLog('Posteo: Foto real subida y guardada en Supabase Storage.', {
      path,
      publicUrl: publicUrlData.publicUrl,
    });
  };

  const handlePublish = async () => {
    if (!publishState.title) return;

    if (!userId) {
      setPublishError('No se encontró tu sesión. Iniciá sesión de nuevo e intentá otra vez.');
      return;
    }

    setPublishError(null);
    setIsPublishing(true);

    // try/catch/finally: si algo inesperado explota a mitad de camino, la
    // pantalla de carga SIEMPRE se apaga (antes, un error no atrapado acá
    // dejaba "Publicando artículo..." girando para siempre, sin que el
    // pedido llegara ni siquiera a mandarse a Supabase).
    try {
      addLog('Posteo Inteligente: Enviando publicación real a Supabase', {
        listingType: publishState.listingType,
        title: publishState.title,
        description: publishState.description,
        category: publishState.category,
        exchangeType: publishState.listingType === 'barter' ? publishState.exchangeType : 'objeto',
        creditValue: publishState.creditValue,
        photosCount: publishState.photos.length,
        fromDraftId: publishState.draftId,
        deliveryMode: publishState.deliveryMode,
      });

      const { id, error } = await saveListing(userId, publishState, 'disponible');

      if (error || !id) {
        setPublishError('No se pudo publicar. Intentá de nuevo en un momento.');
        addLog('Posteo Inteligente: Error al publicar en Supabase', { message: error });
        return;
      }

      addLog('Posteo Inteligente: Publicación exitosa y guardada en la base de datos real.', {
        item_id: id,
        is_live: true,
        channel: 'Supabase: public.listings',
      });

      // Reseteamos el formulario a cero: si no, la próxima vez que el
      // usuario entra a "Posteo" ve los datos de ESTA publicación ya
      // hecha, como si la estuviera editando, en vez de un formulario
      // limpio para una nueva.
      setPublishState({ ...BLANK_PUBLISH_STATE });

      // Refresca el catálogo y, si venía de un borrador o de editar una
      // publicación activa, ambas listas (puede haber pasado de una a la otra).
      await Promise.all([onPublished(), refreshDrafts(), refreshActiveListings()]);
      onAdvance(); // Ir al Catálogo a verla publicada
    } catch (err: any) {
      setPublishError('Ocurrió un error inesperado al publicar. Intentá de nuevo.');
      addLog('Posteo Inteligente: Excepción inesperada al publicar', { message: err?.message ?? String(err) });
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!userId) {
      setPublishError('No se encontró tu sesión. Iniciá sesión de nuevo e intentá otra vez.');
      return;
    }

    setPublishError(null);
    setIsSavingDraft(true);

    try {
      const { id, error } = await saveListing(userId, publishState, 'borrador');

      if (error || !id) {
        setPublishError('No se pudo guardar el borrador. Intentá de nuevo.');
        addLog('Posteo: Error al guardar borrador en Supabase', { message: error });
        return;
      }

      setPublishState((prev) => ({ ...prev, draftId: id, status: 'draft' }));
      addLog('Posteo: Borrador guardado en Supabase.', { draftId: id });
      setDraftSavedAt(Date.now());
      setTimeout(() => setDraftSavedAt(null), 2500);
      await Promise.all([refreshDrafts(), refreshActiveListings()]);
    } catch (err: any) {
      setPublishError('Ocurrió un error inesperado al guardar el borrador. Intentá de nuevo.');
      addLog('Posteo: Excepción inesperada al guardar borrador', { message: err?.message ?? String(err) });
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Carga en el formulario una publicación propia —borrador o ya
  // activa— para seguir editándola. "draftId" acá significa simplemente
  // "la fila que se actualiza al guardar", sea cual sea su status actual.
  const handleLoadListing = (listing: OwnedListing, origin: 'draft' | 'active') => {
    setPublishState({
      listingType: listing.listingType,
      photos: listing.images.map((url, i) => ({
        id: `listing_photo_${listing.id}_${i}`,
        url,
        name: 'foto',
        progress: 100,
        analyzed: true,
      })),
      title: listing.title,
      description: listing.description ?? '',
      category: listing.category ?? '',
      exchangeType: listing.exchangeType,
      creditValue: listing.creditValue != null ? String(listing.creditValue) : '',
      exchangeSearch: '',
      selectedPreferences: ['Abierto a todo'],
      status: 'draft',
      draftId: listing.id,
      deliveryMode: listing.deliveryMode,
      deliveryLat: listing.deliveryLat,
      deliveryLng: listing.deliveryLng,
      deliveryLocationLabel: listing.deliveryLocationLabel,
      deliveryNote: listing.deliveryNote ?? '',
    });
    setDeliveryAddressQuery('');
    setDeliveryLocationError(null);
    setPublishError(null);
    addLog(
      origin === 'active' ? 'Posteo: Publicación activa cargada para editar' : 'Posteo: Borrador cargado para seguir editando',
      { listingId: listing.id, title: listing.title, origin }
    );
  };

  // Despublica una publicación activa: la pasa a "Mis borradores" en vez
  // de borrarla —queda guardada y se puede volver a publicar cuando se
  // quiera, en vez de perderse para siempre.
  const handleUnpublish = async (listingId: string) => {
    if (!userId) return;

    setIsUnpublishingId(listingId);
    try {
      const { error } = await pauseListing(userId, listingId);
      if (error) {
        setActiveListingsError('No se pudo despublicar. Intentá de nuevo.');
        addLog('Posteo: Error al despublicar una publicación activa', { message: error, listingId });
        return;
      }

      addLog('Posteo: Publicación despublicada (pasó a Mis borradores).', { listingId });

      // Si estábamos editando justo ESA publicación, limpiamos el
      // formulario: ya no es "disponible" y seguir mostrándola como si lo
      // fuera sería confuso.
      setPublishState((prev) => (prev.draftId === listingId ? { ...BLANK_PUBLISH_STATE } : prev));

      await Promise.all([refreshActiveListings(), refreshDrafts(), onPublished()]); // sale del Catálogo también
    } catch (err: any) {
      setActiveListingsError('Ocurrió un error inesperado al despublicar.');
      addLog('Posteo: Excepción inesperada al despublicar', { message: err?.message ?? String(err), listingId });
    } finally {
      setIsUnpublishingId(null);
    }
  };

  // Cambia el modo de entrega. Al salir de 'custom' limpiamos las
  // coordenadas/etiqueta: si vuelve a elegir "Otra ubicación" más
  // adelante, empieza de cero en vez de reusar una ubicación vieja sin
  // que se note.
  const handleDeliveryModeChange = (mode: PublishState['deliveryMode']) => {
    setDeliveryLocationError(null);
    setPublishState((prev) => ({
      ...prev,
      deliveryMode: mode,
      ...(mode === 'custom' ? {} : { deliveryLat: null, deliveryLng: null, deliveryLocationLabel: null }),
    }));
    addLog(`Posteo: Modo de entrega cambiado a "${mode}"`, {});
  };

  const handleClearDeliveryLocation = () => {
    setPublishState((prev) => ({ ...prev, deliveryLat: null, deliveryLng: null, deliveryLocationLabel: null }));
    setDeliveryAddressQuery('');
    setDeliveryLocationError(null);
  };

  // Usa el GPS real del navegador para fijar dónde se entrega ESTA
  // publicación (puede no coincidir con la ubicación del perfil, p.ej. si
  // el vendedor está publicando desde otro lugar).
  const handleUseCurrentLocationForDelivery = async () => {
    setIsLocatingDelivery(true);
    setDeliveryLocationError(null);
    const { coords, error } = await requestBrowserLocation();

    if (!coords) {
      setIsLocatingDelivery(false);
      setDeliveryLocationError(error ?? 'No se pudo obtener tu ubicación.');
      addLog('Posteo: no se pudo detectar la ubicación de entrega', { message: error });
      return;
    }

    const place = await reverseGeocode(coords);
    setIsLocatingDelivery(false);
    setPublishState((prev) => ({
      ...prev,
      deliveryLat: coords.lat,
      deliveryLng: coords.lng,
      deliveryLocationLabel: place ?? `Ubicación fijada (${coords.lat.toFixed(2)}, ${coords.lng.toFixed(2)})`,
    }));
    addLog('Posteo: ubicación de entrega fijada con GPS real', { lat: coords.lat, lng: coords.lng });
  };

  // Alternativa sin necesitar estar físicamente ahí: buscar una
  // dirección/zona escrita a mano y geocodificarla a coordenadas reales.
  const handleSearchDeliveryAddress = async () => {
    if (deliveryAddressQuery.trim().length === 0) return;

    setIsSearchingDeliveryAddress(true);
    setDeliveryLocationError(null);
    const result = await forwardGeocode(deliveryAddressQuery);
    setIsSearchingDeliveryAddress(false);

    if (!result) {
      setDeliveryLocationError('No encontramos esa dirección. Probá con otra búsqueda o usá tu ubicación actual.');
      addLog('Posteo: búsqueda de dirección de entrega sin resultados', { query: deliveryAddressQuery });
      return;
    }

    setPublishState((prev) => ({
      ...prev,
      deliveryLat: result.coords.lat,
      deliveryLng: result.coords.lng,
      deliveryLocationLabel: result.label,
    }));
    addLog('Posteo: ubicación de entrega fijada por búsqueda de dirección', {
      query: deliveryAddressQuery,
      label: result.label,
    });
  };

  const handleDeleteDraft = async (draftId: string) => {
    if (!userId) return;
    const { error } = await deleteDraft(userId, draftId);
    if (error) {
      addLog('Posteo: Error al borrar borrador', { message: error });
      return;
    }
    // Si estábamos editando justo ESE borrador, limpiamos el formulario.
    setPublishState((prev) => (prev.draftId === draftId ? { ...BLANK_PUBLISH_STATE } : prev));
    addLog('Posteo: Borrador eliminado', { draftId });
    await refreshDrafts();
  };

  const handleStartNew = () => {
    setPublishState({ ...BLANK_PUBLISH_STATE });
    setPublishError(null);
  };

  // Deriva la categoría principal y la subcategoría (si hay) del string
  // guardado en publishState.category ("Principal" o "Principal > Sub").
  const [categoryMain, categorySub] = publishState.category.split(' > ').map((s) => s.trim());
  const currentCategorySubs = CATEGORIES.find((g) => g.name === categoryMain)?.subcategories ?? [];

  const needsCreditValue =
    publishState.listingType === 'barter' &&
    (publishState.exchangeType === 'creditos' || publishState.exchangeType === 'ambos');
  const creditValueIsValid = !needsCreditValue || Number(publishState.creditValue) > 0;

  // Si eligió "Otra ubicación" tiene que haber quedado fijada de verdad
  // (con GPS o buscando una dirección) antes de poder publicar — pero no
  // hace falta todavía para guardar un borrador a medio completar.
  const deliveryLocationIsValid =
    publishState.deliveryMode !== 'custom' || (publishState.deliveryLat != null && publishState.deliveryLng != null);

  const isFormValid =
    publishState.title.length > 3 &&
    publishState.photos.length > 0 &&
    publishState.category.length > 0 &&
    creditValueIsValid &&
    deliveryLocationIsValid;

  // Lista legible de qué falta completar, para mostrarla junto al botón
  // "Publicar ahora" cuando está desactivado (si no, parece roto).
  const missingFields: string[] = [];
  if (publishState.title.length <= 3) missingFields.push('un título de más de 3 letras');
  if (publishState.photos.length === 0) missingFields.push('al menos una foto');
  if (publishState.category.length === 0) missingFields.push('una categoría');
  if (needsCreditValue && !creditValueIsValid) missingFields.push('el precio en créditos (mayor a 0)');
  if (!deliveryLocationIsValid) missingFields.push('fijar la ubicación de entrega (o elegir otra opción)');

  return (
    <div className="relative flex flex-col flex-1 w-full bg-canvas md:rounded-2xl md:border md:border-border md:shadow-sm overflow-y-auto p-5">
      {/* Blob decorativo detrás del encabezado, igual que en el resto de las pantallas */}
      <div aria-hidden="true" className="absolute top-3 right-3 w-20 h-20 bg-gold/20 blob-shape-2 pointer-events-none z-0" />

      {/* Top Header */}
      <div className="relative z-10 flex justify-between items-center pb-3 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 transition-transform duration-300 ease-bounce hover:-rotate-6 hover:scale-110">
            <span className="material-symbols-rounded text-[18px] text-primary">sell</span>
          </div>
          <div>
            <h2 className="font-display text-xl font-black text-primary-dark leading-none mb-1">Crear Publicación</h2>
            <p className="text-xs text-ink-soft">Publicá tu artículo con fotos y datos reales</p>
          </div>
        </div>
      </div>

      {/* Mis publicaciones activas: editar o despublicar algo que ya está en el Catálogo */}
      {activeListings.length > 0 && (
        <div id="publish-active-listings-section" className="my-4 bg-white rounded-xl border border-border p-3">
          <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-2">
            Mis publicaciones activas ({activeListings.length})
          </h3>
          {activeListingsError && (
            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-2">
              {activeListingsError}
            </p>
          )}
          <div className="space-y-2">
            {activeListings.map((listing) => (
              <div
                key={listing.id}
                id={`publish-active-listing-row-${listing.id}`}
                className={`flex items-center gap-2 rounded-lg p-2 border transition-all duration-200 ease-bounce hover:shadow-sm hover:-translate-y-0.5 ${
                  publishState.draftId === listing.id ? 'bg-primary/10 border-primary/30' : 'bg-bg-soft border-transparent'
                }`}>
                <div className="w-10 h-10 rounded-lg bg-border overflow-hidden shrink-0">
                  {listing.images[0] && <img src={listing.images[0]} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{listing.title || '(Sin título)'}</p>
                  <p className="text-[10px] text-ink-soft truncate">{listing.category ?? 'Sin categoría'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadListing(listing, 'active')}
                  className="text-[10px] font-bold text-primary hover:underline whitespace-nowrap shrink-0">
                  Editar
                </button>
                <button
                  type="button"
                  disabled={isUnpublishingId === listing.id}
                  onClick={() => handleUnpublish(listing.id)}
                  className="text-[10px] font-bold text-gold-dark hover:underline whitespace-nowrap shrink-0 disabled:opacity-50">
                  {isUnpublishingId === listing.id ? 'Despublicando...' : 'Despublicar'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Mis borradores */}
      {drafts.length > 0 && (
        <div id="publish-drafts-section" className="my-4 bg-white rounded-xl border border-border p-3">
          <h3 className="text-[11px] font-bold text-ink-soft uppercase tracking-wide mb-2">
            Mis borradores ({drafts.length})
          </h3>
          <div className="space-y-2">
            {drafts.map((draft) => (
              <div
                key={draft.id}
                id={`publish-draft-row-${draft.id}`}
                className={`flex items-center gap-2 rounded-lg p-2 border transition-all duration-200 ease-bounce hover:shadow-sm hover:-translate-y-0.5 ${
                  publishState.draftId === draft.id ? 'bg-plum-light/30 border-plum/30' : 'bg-bg-soft border-transparent'
                }`}>
                <div className="w-10 h-10 rounded-lg bg-border overflow-hidden shrink-0">
                  {draft.images[0] && <img src={draft.images[0]} alt="" className="w-full h-full object-cover" />}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-ink truncate">{draft.title || '(Sin título)'}</p>
                  <p className="text-[10px] text-ink-soft truncate">{draft.category ?? 'Sin categoría'}</p>
                </div>
                <button
                  type="button"
                  onClick={() => handleLoadListing(draft, 'draft')}
                  className="text-[10px] font-bold text-primary hover:underline whitespace-nowrap shrink-0">
                  Seguir editando
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteDraft(draft.id)}
                  className="text-red-500 hover:text-red-700 shrink-0"
                  aria-label="Eliminar borrador">
                  <span className="material-symbols-rounded text-[16px]">delete</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Banner: editando una publicación existente (borrador o ya activa) */}
      {publishState.draftId && (
        <div id="publish-editing-draft-banner" className="mb-3 flex items-center justify-between gap-2 bg-plum-light/40 border border-plum/20 rounded-lg px-3 py-2">
          <span className="text-[10px] font-bold text-plum">
            {activeListings.some((l) => l.id === publishState.draftId)
              ? 'Editando una publicación activa — al publicar, se actualiza sin salir del Catálogo'
              : 'Editando un borrador guardado'}
          </span>
          <button type="button" onClick={handleStartNew} className="text-[10px] font-bold text-plum hover:underline whitespace-nowrap">
            Empezar publicación nueva
          </button>
        </div>
      )}

      {/* Barter/Donation Selector Toggle */}
      <div className="my-5 flex flex-col items-center gap-2">
        <label className="text-[11px] font-bold text-ink-soft tracking-wider uppercase">Tipo de Intercambio</label>
        <div className="bg-bg-soft p-1 rounded-full flex w-full max-w-xs shadow-inner relative overflow-hidden">
          <button
            type="button"
            onClick={() => {
              setPublishState((prev) => ({ ...prev, listingType: 'barter' }));
              addLog('Posteo: Tipo cambiado a "Trueque"', { accentColor: 'Verde (#2f6b4c)' });
            }}
            id="publish-toggle-barter"
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ease-bounce z-10 active:scale-95 ${
              publishState.listingType === 'barter'
                ? 'bg-primary text-primary-light shadow-md'
                : 'text-ink-soft hover:bg-border/20'
            }`}>
            Trueque
          </button>

          <button
            type="button"
            onClick={() => {
              setPublishState((prev) => ({ ...prev, listingType: 'donation' }));
              addLog('Posteo: Tipo cambiado a "Donación/Regalo"', { accentColor: 'Naranja (#d99a2b)' });
            }}
            id="publish-toggle-donation"
            className={`flex-1 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ease-bounce z-10 active:scale-95 ${
              publishState.listingType === 'donation'
                ? 'bg-warning text-ink shadow-md'
                : 'text-ink-soft hover:bg-border/20'
            }`}>
            Donación
          </button>
        </div>
      </div>

      {/* Dynamic Colored Border Section */}
      <div className={`p-4 rounded-xl border bg-white shadow-sm space-y-4 transition-all duration-300 ${
        publishState.listingType === 'barter' ? 'border-primary/25' : 'border-warning/25'
      }`}>
        {/* Media Upload */}
        <div>
          <span className="block text-[11px] font-bold text-ink-soft mb-2 uppercase tracking-wide">Galería de Fotos</span>

          <div className="grid grid-cols-3 gap-2.5">
            {/* Real upload trigger */}
            <input
              ref={fileInputRef}
              id="publish-photo-file-input"
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={handleFileSelected}
            />
            <button
              id="publish-upload-photo-btn"
              type="button"
              disabled={isUploadingPhoto}
              onClick={() => fileInputRef.current?.click()}
              className="aspect-square rounded-xl border-2 border-dashed border-border hover:border-primary hover:bg-primary/5 hover:-translate-y-0.5 flex flex-col items-center justify-center gap-1 group active:scale-95 transition-all duration-200 ease-bounce text-center p-2 disabled:opacity-60">
              {isUploadingPhoto ? (
                <>
                  <div className="w-5 h-5 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-[9px] font-bold leading-normal text-ink-soft">Subiendo...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-rounded text-[20px] text-primary group-hover:scale-110 duration-200">add_a_photo</span>
                  <span className="text-[9px] font-bold leading-normal text-ink-soft">Subir foto</span>
                </>
              )}
            </button>

            {/* Render uploaded image thumbnails */}
            {publishState.photos.map((photo) => (
              <div key={photo.id} className="relative aspect-square rounded-xl overflow-hidden group border border-border/40 shadow-sm">
                <img alt="Thumbnail" className="w-full h-full object-cover" src={photo.url} />
                <button
                  type="button"
                  onClick={() => {
                    setPublishState((prev) => ({ ...prev, photos: prev.photos.filter((p) => p.id !== photo.id) }));
                    addLog('Posteo: Foto eliminada de la galería', { photoId: photo.id });
                  }}
                  className="absolute top-1 right-1 bg-red-600 text-white p-1 rounded-full shadow hover:bg-red-700 hover:scale-110 active:scale-90 transition-all duration-200 ease-bounce">
                  <span className="material-symbols-rounded text-[10px] leading-none block">close</span>
                </button>
              </div>
            ))}
          </div>

          {uploadError && (
            <p id="publish-upload-error" className="mt-2 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {uploadError}
            </p>
          )}
        </div>

        {/* Text Form Fields */}
        <div className="space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="publish-title-input">Título de la publicación</label>
            <input
              id="publish-title-input"
              type="text"
              value={publishState.title}
              onChange={(e) => setPublishState((prev) => ({ ...prev, title: e.target.value }))}
              placeholder="Ej. Reloj minimalista o similar..."
              className="w-full px-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-ink-soft mb-1" htmlFor="publish-desc-input">Descripción del artículo</label>
            <textarea
              id="publish-desc-input"
              value={publishState.description}
              onChange={(e) => setPublishState((prev) => ({ ...prev, description: e.target.value }))}
              placeholder="Detalles sobre uso, antigüedad, caja, cables..."
              rows={3}
              className="w-full px-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
            />
          </div>

          {/* Category selector: primero la categoría principal, y si
              tiene subcategorías, aparecen debajo para elegir una
              (opcional — se puede publicar solo con la principal). El
              valor final se guarda como "Principal" o "Principal > Sub". */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-ink-soft">Categoría</label>
            <div className="flex flex-wrap gap-1.5">
              {CATEGORIES.map((group) => (
                <button
                  key={group.name}
                  id={`publish-category-${group.name}`}
                  type="button"
                  onClick={() => {
                    setPublishState((prev) => ({ ...prev, category: group.name }));
                    addLog(`Posteo: Categoría seleccionada: "${group.name}"`, {});
                  }}
                  className={`px-2.5 py-1 rounded-full border text-[10px] font-bold transition-all duration-200 ease-bounce hover:-rotate-2 hover:scale-105 active:scale-95 ${
                    categoryMain === group.name
                      ? 'bg-primary text-primary-light border-primary'
                      : 'bg-bg-soft text-ink-soft border-border/50 hover:bg-border/20'
                  }`}>
                  {group.name}
                </button>
              ))}
            </div>

            {currentCategorySubs.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {currentCategorySubs.map((sub) => (
                  <button
                    key={sub}
                    id={`publish-subcategory-${sub}`}
                    type="button"
                    onClick={() => {
                      const next = categorySub === sub ? categoryMain : `${categoryMain} > ${sub}`;
                      setPublishState((prev) => ({ ...prev, category: next }));
                      addLog(`Posteo: Subcategoría seleccionada: "${sub}"`, {});
                    }}
                    className={`px-2.5 py-1 rounded-full border text-[10px] font-semibold transition-all duration-200 ease-bounce hover:-rotate-2 hover:scale-105 active:scale-95 ${
                      categorySub === sub
                        ? 'bg-gold-dark text-white border-gold-dark'
                        : 'bg-white text-ink-soft border-border/50 hover:bg-border/20'
                    }`}>
                    {sub}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Conditional Trade Value Requirement Box */}
          {publishState.listingType === 'barter' && (
            <div id="publish-exchange-container" className="space-y-3">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-ink-soft" htmlFor="publish-exchange-input">¿Qué buscas a cambio?</label>
                <div className="relative">
                  <input
                    id="publish-exchange-input"
                    type="text"
                    value={publishState.exchangeSearch}
                    onChange={(e) => setPublishState((prev) => ({ ...prev, exchangeSearch: e.target.value }))}
                    placeholder="Ej. Consolas de videojuegos, Auriculares..."
                    className="w-full px-4 py-2 pr-10 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
                  />
                  <span className="material-symbols-rounded text-primary absolute right-3 top-1/2 -translate-y-1/2">swap_horiz</span>
                </div>
                <div className="flex gap-1">
                  {['Abierto a Todo', 'Tecnología', 'Bicicletas'].map((chip) => (
                    <button
                      key={chip}
                      type="button"
                      onClick={() => {
                        setPublishState((prev) => ({ ...prev, exchangeSearch: chip }));
                        addLog(`Posteo: Preferencia autoseleccionada: "${chip}"`, {});
                      }}
                      className="px-2.5 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 text-[9px] font-semibold hover:bg-primary/20 hover:-rotate-2 hover:scale-105 active:scale-95 transition-all duration-200 ease-bounce">
                      {chip}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exchange type: objeto / créditos / ambos */}
              <div className="space-y-1.5">
                <label className="block text-[11px] font-semibold text-ink-soft">¿Aceptás créditos TrueK?</label>
                <div className="bg-bg-soft p-1 rounded-full flex w-full shadow-inner">
                  {([
                    { key: 'objeto', label: 'Solo objeto' },
                    { key: 'creditos', label: 'Solo créditos' },
                    { key: 'ambos', label: 'Objeto o créditos' },
                  ] as const).map((opt) => (
                    <button
                      key={opt.key}
                      id={`publish-exchange-type-${opt.key}`}
                      type="button"
                      onClick={() => {
                        setPublishState((prev) => ({ ...prev, exchangeType: opt.key }));
                        addLog(`Posteo: Tipo de intercambio cambiado a "${opt.label}"`, {});
                      }}
                      className={`flex-1 py-1.5 rounded-full text-[10px] font-bold transition-all duration-300 ease-bounce active:scale-95 ${
                        publishState.exchangeType === opt.key
                          ? 'bg-primary text-primary-light shadow-md'
                          : 'text-ink-soft hover:bg-border/20'
                      }`}>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {needsCreditValue && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-semibold text-ink-soft" htmlFor="publish-credit-value-input">
                    Precio en créditos
                  </label>
                  <input
                    id="publish-credit-value-input"
                    type="number"
                    min={1}
                    value={publishState.creditValue}
                    onChange={(e) => setPublishState((prev) => ({ ...prev, creditValue: e.target.value }))}
                    placeholder="Ej. 20"
                    className="w-full px-4 py-2 text-sm bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
                  />
                  <p className="text-[10px] text-ink-soft">
                    Guía: 1 crédito ≈ un litro de nafta súper. Objetos chicos 5-15, medianos 20-50, grandes 60-150+.{' '}
                    <span className="font-semibold">Más detalle en tu perfil.</span>
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Ubicación de entrega: puede ser distinta de tu ubicación de perfil */}
      <div id="publish-delivery-section" className="p-4 rounded-xl border border-border/30 bg-white shadow-sm space-y-3 mt-4">
        <div>
          <span className="block text-[11px] font-bold text-ink-soft mb-1 uppercase tracking-wide">¿Dónde se entrega esto?</span>
          <p className="text-[10px] text-ink-soft">
            Por defecto usamos tu ubicación habitual para calcular la distancia en el Catálogo. Cambialo si el
            artículo está en otro lado, o si prefieren coordinar el lugar por chat.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-1.5">
          {([
            { key: 'profile', label: 'Mi ubicación' },
            { key: 'custom', label: 'Otra ubicación' },
            { key: 'tbd', label: 'A definir' },
          ] as const).map((opt) => (
            <button
              key={opt.key}
              id={`publish-delivery-mode-${opt.key}`}
              type="button"
              onClick={() => handleDeliveryModeChange(opt.key)}
              className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all duration-200 ease-bounce hover:scale-105 active:scale-95 ${
                publishState.deliveryMode === opt.key
                  ? 'bg-primary text-white border-primary'
                  : 'bg-bg-soft text-ink-soft border-border/50 hover:bg-border/20'
              }`}>
              {opt.label}
            </button>
          ))}
        </div>

        {publishState.deliveryMode === 'custom' && (
          <div className="space-y-2 pt-2 border-t border-border">
            {publishState.deliveryLat != null && publishState.deliveryLng != null ? (
              <div className="flex items-center justify-between gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className="material-symbols-rounded text-[14px] text-primary">location_on</span>
                  <span className="text-[11px] font-semibold text-ink truncate">
                    {publishState.deliveryLocationLabel || 'Ubicación real fijada'}
                  </span>
                </div>
                <button
                  id="publish-delivery-change-location"
                  type="button"
                  onClick={handleClearDeliveryLocation}
                  className="text-[10px] font-bold text-primary hover:underline whitespace-nowrap shrink-0">
                  Cambiar
                </button>
              </div>
            ) : (
              <>
                <button
                  id="publish-delivery-use-gps"
                  type="button"
                  disabled={isLocatingDelivery}
                  onClick={handleUseCurrentLocationForDelivery}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-lg bg-bg-soft text-ink text-[11px] font-bold hover:bg-border disabled:opacity-60 transition-colors">
                  <span className="material-symbols-rounded text-[14px]">my_location</span>
                  {isLocatingDelivery ? 'Detectando...' : 'Usar mi ubicación actual'}
                </button>

                <div className="flex gap-1.5">
                  <input
                    id="publish-delivery-address-input"
                    type="text"
                    value={deliveryAddressQuery}
                    onChange={(e) => setDeliveryAddressQuery(e.target.value)}
                    placeholder="O escribí una dirección/zona (ej. Palermo, Buenos Aires)"
                    className="flex-1 px-3 py-1.5 text-[11px] bg-bg-soft border-none rounded-lg focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none text-ink"
                  />
                  <button
                    id="publish-delivery-search-address"
                    type="button"
                    disabled={isSearchingDeliveryAddress || deliveryAddressQuery.trim().length === 0}
                    onClick={handleSearchDeliveryAddress}
                    className="px-3 py-1.5 rounded-lg bg-primary text-white text-[11px] font-bold disabled:opacity-50 hover:bg-primary-dark hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-bounce">
                    {isSearchingDeliveryAddress ? '...' : 'Buscar'}
                  </button>
                </div>

                {deliveryLocationError && <p className="text-[10px] text-red-600">{deliveryLocationError}</p>}
              </>
            )}
          </div>
        )}

        {/* Nota libre: siempre disponible, sin importar el modo elegido */}
        <div className="space-y-1 pt-2 border-t border-border">
          <label className="block text-[11px] font-semibold text-ink-soft" htmlFor="publish-delivery-note-input">
            Nota de entrega (opcional)
          </label>
          <input
            id="publish-delivery-note-input"
            type="text"
            value={publishState.deliveryNote}
            onChange={(e) => setPublishState((prev) => ({ ...prev, deliveryNote: e.target.value }))}
            placeholder="Ej. Entrego cerca del Subte Línea B, o coordinamos horario por chat"
            maxLength={140}
            className="w-full px-3 py-1.5 text-[11px] bg-bg-soft border-none rounded-lg focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none text-ink"
          />
        </div>
      </div>

      {/* Action CTA Block */}
      {publishError && (
        <p id="publish-error-message" className="mt-3 text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
          {publishError}
        </p>
      )}
      {!isFormValid && missingFields.length > 0 && (
        <p id="publish-missing-fields" className="mt-3 text-[11px] font-semibold text-primary bg-plum-light border border-plum/30 rounded-lg px-3 py-2">
          Para poder publicar todavía falta: {missingFields.join(', ')}.
        </p>
      )}

      <div className="mt-auto pt-4 border-t border-bg-soft flex flex-col gap-2">
        <div className="flex gap-3">
          <button
            id="publish-save-draft"
            type="button"
            disabled={isSavingDraft}
            onClick={handleSaveDraft}
            className="flex-1 bg-border text-ink py-3 rounded-xl font-bold text-xs hover:bg-border hover:-translate-y-0.5 active:scale-95 transition-all duration-200 ease-bounce text-center disabled:opacity-60">
            {isSavingDraft ? 'Guardando...' : 'Guardar borrador'}
          </button>

          <button
            id="publish-submit-btn"
            type="button"
            disabled={!isFormValid}
            onClick={handlePublish}
            className={`group flex-[2] text-white py-3 rounded-xl font-bold text-xs shadow-md hover:-translate-y-0.5 hover:shadow-lg active:scale-95 transition-all duration-200 ease-bounce flex items-center justify-center gap-2 ${
              isFormValid
                ? publishState.listingType === 'barter' ? 'bg-primary hover:bg-primary-dark' : 'bg-warning hover:brightness-95 !text-ink'
                : 'bg-border text-ink-soft cursor-not-allowed'
            }`}>
            <span>Publicar ahora</span>
            <span className="material-symbols-rounded text-[16px] inline-block transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5">rocket_launch</span>
          </button>
        </div>

        {draftSavedAt !== null && (
          <p id="publish-draft-saved-confirmation" className="text-[10px] font-bold text-primary text-center flex items-center justify-center gap-1">
            <span className="material-symbols-rounded text-[14px]">check_circle</span>
            <span>Borrador guardado en tu cuenta. Lo vas a encontrar en "Mis borradores" cuando vuelvas.</span>
          </p>
        )}
      </div>

      {/* Full screen loading overlay */}
      {isPublishing && (
        <div id="publish-loading-overlay" className="absolute inset-0 z-40 bg-bg-soft/90 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-center">
          <div className="w-14 h-14 border-[4px] border-primary border-t-transparent rounded-full animate-spin mb-4" />
          <h3 className="font-display text-base font-extrabold text-ink leading-none">Publicando artículo...</h3>
          <p className="text-xs text-ink-soft mt-1 max-w-xs">Guardando tu publicación real en la base de datos.</p>
        </div>
      )}
    </div>
  );
}
