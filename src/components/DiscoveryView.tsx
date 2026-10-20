/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import TruekMascot from './TruekMascot';
import { FeedItem } from '../types';
import { formatDistance } from '../lib/geo';
import { submitReport, ReportReason, REPORT_REASON_LABELS } from '../lib/reports';
import { blockUser } from '../lib/blocks';

// Texto de distancia para la card: si el vendedor eligió "A definir por
// chat" para esta publicación, nunca mostramos "Distancia desconocida"
// (que suena a error) sino que lo decimos explícitamente.
function distanceLabel(item: FeedItem): string {
  if (item.deliveryMode === 'tbd') return 'A definir';
  return formatDistance(item.distance);
}

// Segunda línea opcional bajo el título: dónde se entrega, si el vendedor
// dejó algo para mostrar (ubicación de entrega distinta a la de su
// perfil, y/o una nota libre).
function getDeliveryCaption(item: FeedItem): string | null {
  if (item.deliveryMode === 'tbd') {
    return item.deliveryNote ? `A definir: ${item.deliveryNote}` : 'A definir por chat';
  }
  if (item.deliveryMode === 'custom' && item.deliveryLocationLabel) {
    return `Entrega en ${item.deliveryLocationLabel}`;
  }
  return item.deliveryNote || null;
}

interface DiscoveryViewProps {
  feedItems: FeedItem[];
  onStartChat: (item: FeedItem) => void;
  // false si todavía no tenemos la ubicación real de quien mira el
  // catálogo (nunca se detectó, o la rechazó en el onboarding). En ese
  // caso todas las distancias llegan en null y mostramos un banner para
  // activarla.
  hasMyLocation: boolean;
  onUpdateMyLocation: () => Promise<{ error: string | null }>;
  currentUserId: string;
  addLog: (title: string, data: any) => void;
}

const REPORT_REASONS: ReportReason[] = ['spam', 'estafa', 'contenido_inapropiado', 'no_corresponde', 'otro'];

// Tope del slider de distancia. Al llegar acá no filtramos más por
// distancia -- mostramos todo, sin límite -- en vez de cortar en 50km.
const MAX_DISTANCE_KM = 50;

export default function DiscoveryView({
  feedItems,
  onStartChat,
  hasMyLocation,
  onUpdateMyLocation,
  currentUserId,
  addLog,
}: DiscoveryViewProps) {
  const [distance, setDistance] = useState<number>(30);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<'near' | 'recent' | 'barters' | 'donations'>('near');
  const [filteredItems, setFilteredItems] = useState<FeedItem[]>(feedItems);
  const [isUpdatingFeed, setIsUpdatingFeed] = useState(false);
  const [isActivatingLocation, setIsActivatingLocation] = useState(false);
  const [locationBannerError, setLocationBannerError] = useState<string | null>(null);

  // --- Reportar una publicación (y a su vendedor) ---
  const [reportingItem, setReportingItem] = useState<FeedItem | null>(null);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportComment, setReportComment] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // --- Bloquear al vendedor directo desde el mismo modal ---
  const [blockingUser, setBlockingUser] = useState(false);
  const [blockError, setBlockError] = useState<string | null>(null);
  const [userBlocked, setUserBlocked] = useState(false);

  // Para que al bloquear a alguien sus publicaciones desaparezcan del
  // Catálogo al instante, sin esperar a que se vuelva a traer el feed
  // real del servidor.
  const [locallyBlockedSellerIds, setLocallyBlockedSellerIds] = useState<Set<string>>(new Set());

  const openReportModal = (item: FeedItem) => {
    setReportingItem(item);
    setReportReason('spam');
    setReportComment('');
    setReportError(null);
    setReportSubmitted(false);
    setBlockError(null);
    setUserBlocked(false);
  };

  const handleBlockFromReport = async () => {
    if (!reportingItem || blockingUser) return;

    setBlockingUser(true);
    setBlockError(null);
    const { error } = await blockUser(currentUserId, reportingItem.sellerId);
    setBlockingUser(false);

    if (error) {
      setBlockError('No se pudo bloquear a este usuario. Probá de nuevo.');
      addLog('Catálogo: error al bloquear un usuario', { message: error });
      return;
    }

    addLog('Catálogo: usuario bloqueado de verdad', { userId: reportingItem.sellerId });
    setUserBlocked(true);
    setLocallyBlockedSellerIds((prev) => new Set(prev).add(reportingItem.sellerId));
  };

  const handleSubmitReport = async () => {
    if (!reportingItem || submittingReport) return;

    setSubmittingReport(true);
    setReportError(null);
    const { error } = await submitReport({
      reporterId: currentUserId,
      reportedListingId: reportingItem.id,
      reportedUserId: reportingItem.sellerId,
      reason: reportReason,
      comment: reportComment,
    });
    setSubmittingReport(false);

    if (error) {
      setReportError('No se pudo enviar el reporte. Probá de nuevo.');
      addLog('Catálogo: error al reportar una publicación', { message: error });
      return;
    }

    addLog('Catálogo: publicación/usuario reportado de verdad', { listingId: reportingItem.id, reason: reportReason });
    setReportSubmitted(true);
  };

  // Filter and sort items dynamically representing an optimistic database refresh
  useEffect(() => {
    setIsUpdatingFeed(true);
    const delayTimer = setTimeout(() => {
      let result = feedItems.filter((item) => !locallyBlockedSellerIds.has(item.sellerId));

      // Match Search Bar Queries
      if (searchQuery.trim().length > 0) {
        result = result.filter(item => 
          item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
          item.category.toLowerCase().includes(searchQuery.toLowerCase())
        );
      }

      // Filter by Distance slider value. Si no conocemos la distancia real
      // (todavía no tenemos la ubicación de alguna de las dos partes),
      // nunca la descartamos por el slider — se deja pasar y listo. Y si
      // el slider está en el tope, tampoco filtramos por distancia: el
      // tope significa "sin límite", no "hasta 50km".
      const isUnlimited = distance >= MAX_DISTANCE_KM;
      result = result.filter(item => isUnlimited || item.distance === null || item.distance <= distance);

      // Filter by active semantic filters
      if (activeTab === 'barters') {
        result = result.filter(item => item.type === 'barter');
      } else if (activeTab === 'donations') {
        result = result.filter(item => item.type === 'donation');
      } else if (activeTab === 'near') {
        // Sort closest first; las de distancia desconocida (null) van al final.
        result.sort((a, b) => {
          if (a.distance === null && b.distance === null) return 0;
          if (a.distance === null) return 1;
          if (b.distance === null) return -1;
          return a.distance - b.distance;
        });
      } else if (activeTab === 'recent') {
        // Show recently published elements on top
        result = result.filter(item => item.tag === 'RECIÉN PUBLICADO').concat(
          result.filter(item => item.tag !== 'RECIÉN PUBLICADO')
        );
      }

      setFilteredItems(result);
      setIsUpdatingFeed(false);
    }, 300); // 300ms skeleton glow for tactile high-tech feedback

    return () => clearTimeout(delayTimer);
  }, [distance, searchQuery, activeTab, feedItems, locallyBlockedSellerIds]);

  const handleSliderChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value);
    setDistance(val);
    addLog('Filtros: Slider de distancia modificado (Búsqueda optimista local)', {
      newRadiusKm: val >= MAX_DISTANCE_KM ? 'sin límite' : val,
      estimatedNetworkMatchCount: Math.max(1, Math.round(val * 0.4)),
    });
  };

  const handleTabChange = (tab: 'near' | 'recent' | 'barters' | 'donations') => {
    setActiveTab(tab);
    addLog(`Filtros: Categoría de catálogo cambiada a "${tab}"`, { tab });
  };

  const handleActivateLocation = async () => {
    setIsActivatingLocation(true);
    setLocationBannerError(null);
    const { error } = await onUpdateMyLocation();
    setIsActivatingLocation(false);
    if (error) {
      setLocationBannerError(error);
    }
  };

  return (
    <div className="relative flex flex-col flex-1 w-full bg-canvas md:rounded-2xl md:border md:border-border md:shadow-sm overflow-y-auto p-4 text-ink">
      
      {/* Top Search Input and Mode Toggle */}
      <section className="space-y-3 mb-5">
        <label className="text-sm font-black text-primary-dark block" htmlFor="discovery-search-input">Explorar TrueK</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="material-symbols-rounded text-ink-soft absolute left-3 top-1/2 -translate-y-1/2">search</span>
            <input 
              id="discovery-search-input"
              type="text" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="¿Qué buscas hoy?"
              className="w-full pl-9 pr-4 py-2 text-xs bg-bg-soft border-none rounded-xl focus:ring-2 focus:ring-primary focus:bg-white focus:outline-none transition-all text-ink"
            />
          </div>
          <div className="bg-bg-soft p-0.5 rounded-lg flex shrink-0">
            <button 
              id="discovery-toggle-grid"
              type="button" 
              className="p-1 px-1.5 rounded bg-white text-primary shadow-sm">
              <span className="material-symbols-rounded text-[16px] block">grid_view</span>
            </button>
            <button 
              id="discovery-toggle-map"
              type="button" 
              onClick={() => addLog('Navigation: Mapa georeferenciado inactivo en Sandbox', {})}
              className="p-1 px-1.5 rounded text-ink-soft hover:bg-border">
              <span className="material-symbols-rounded text-[16px] block">map</span>
            </button>
          </div>
        </div>
      </section>

      {/* Semantic filter chips carousel slider */}
      <section className="mb-4">
        <div className="flex gap-1.5 overflow-x-auto pb-2 scrollbar-none scroll-smooth">
          <button
            id="filter-tab-near"
            type="button"
            onClick={() => handleTabChange('near')}
            className={`px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-all duration-200 ease-bounce shrink-0 shadow-sm hover:-rotate-1 hover:scale-105 active:scale-95 ${
              activeTab === 'near' ? 'bg-primary text-white border-primary scale-105' : 'bg-surface text-ink border-border'
            }`}>
            Cerca de mí
          </button>
          <button
            id="filter-tab-recent"
            type="button"
            onClick={() => handleTabChange('recent')}
            className={`px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-all duration-200 ease-bounce shrink-0 shadow-sm hover:-rotate-1 hover:scale-105 active:scale-95 ${
              activeTab === 'recent' ? 'bg-accent text-white border-accent scale-105' : 'bg-surface text-ink border-border'
            }`}>
            Recién publicados
          </button>
          <button
            id="filter-tab-barters"
            type="button"
            onClick={() => handleTabChange('barters')}
            className={`px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-all duration-200 ease-bounce shrink-0 shadow-sm hover:-rotate-1 hover:scale-105 active:scale-95 ${
              activeTab === 'barters' ? 'bg-primary text-white border-primary scale-105' : 'bg-surface text-ink border-border'
            }`}>
            Solo trueque
          </button>
          <button
            id="filter-tab-donations"
            type="button"
            onClick={() => handleTabChange('donations')}
            className={`px-3.5 py-1.5 text-[11px] font-bold rounded-full border transition-all duration-200 ease-bounce shrink-0 shadow-sm hover:-rotate-1 hover:scale-105 active:scale-95 ${
              activeTab === 'donations' ? 'bg-warning text-white border-warning scale-105' : 'bg-surface text-ink border-border'
            }`}>
            Solo donaciones
          </button>
        </div>

        {/* Optimistic Distance slider */}
        <div className="mt-3 bg-bg-soft p-3 rounded-xl border border-border/20">
          <div className="flex justify-between items-center text-[11px] font-bold text-ink-soft mb-1">
            <span>Rango máximo de distancia</span>
            <span id="discovery-distance-display" className="text-gold-dark font-extrabold">
              {distance >= MAX_DISTANCE_KM ? 'Sin límite' : `${distance} Km`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <input
              id="discovery-distance-slider"
              type="range"
              min="1"
              max={MAX_DISTANCE_KM}
              value={distance}
              onChange={handleSliderChange}
              className="flex-1 accent-primary cursor-pointer h-1 rounded-full bg-border"
            />
          </div>
          {distance >= MAX_DISTANCE_KM && (
            <p className="text-[9px] text-ink-faint mt-1">Mostrando publicaciones de cualquier distancia.</p>
          )}
        </div>
      </section>

      {/* Banner para activar ubicación real si todavía no la tenemos */}
      {!hasMyLocation && (
        <div className="mb-4 bg-accent-light border border-warning/40 rounded-xl p-3 flex items-start gap-2.5">
          <span className="material-symbols-rounded text-accent-dark text-[18px] shrink-0">location_off</span>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold text-ink">Activá tu ubicación para ver distancias reales</p>
            <p className="text-[10px] text-ink/80 mt-0.5">
              Todavía no sabemos dónde estás, así que no podemos calcular a cuántos km está cada publicación.
            </p>
            {locationBannerError && (
              <p className="text-[10px] text-red-700 font-semibold mt-1">{locationBannerError}</p>
            )}
            <button
              id="discovery-activate-location"
              type="button"
              onClick={handleActivateLocation}
              disabled={isActivatingLocation}
              className="mt-2 text-[10px] font-extrabold text-white bg-primary hover:bg-primary-dark disabled:opacity-60 rounded-lg px-3 py-1.5 transition-colors">
              {isActivatingLocation ? 'Detectando...' : 'Activar ubicación'}
            </button>
          </div>
        </div>
      )}

      {/* Main Catalog Feed Render area */}
      <h3 className="text-xs font-black text-primary-dark uppercase tracking-widest mb-2.5">Catálogo de la Comunidad</h3>

      <div className="grid grid-cols-2 gap-3 pb-8">
        {isUpdatingFeed ? (
          // Tactical glow skeletons representing optimistic feedback loops
          Array.from({ length: 4 }).map((_, index) => (
            <div key={index} className="bg-bg-soft rounded-xl overflow-hidden aspect-[4/5] p-3 space-y-2 border border-border animate-pulse">
              <div className="h-2/3 bg-border rounded-lg" />
              <div className="h-3 bg-border w-3/4 rounded-full" />
              <div className="h-2.5 bg-border w-1/2 rounded-full mt-2" />
            </div>
          ))
        ) : filteredItems.length === 0 ? (
          <div className="col-span-2 py-8 text-center bg-white rounded-xl border border-dashed border-border p-5">
            <TruekMascot className="w-16 h-16 mx-auto mb-2 animate-truek-float" />
            <p className="text-xs font-bold text-ink-soft">No se encontraron artículos</p>
            <p className="text-[10px] text-ink-soft mt-1">Prueba a ampliar el slider de distancia o introduce otra palabra clave.</p>
          </div>
        ) : (
          filteredItems.map((item) => {
            const isBarter = item.type === 'barter';
            return (
              <div
                id={`feed-card-${item.id}`}
                key={item.id}
                className="group bg-white rounded-xl overflow-hidden shadow-sm hover:shadow-md hover:-translate-y-1 hover:rotate-1 transition-all duration-300 ease-bounce flex flex-col justify-between">
                
                {/* Product Image Panel */}
                <div className="relative aspect-[4/3] bg-bg-soft overflow-hidden">
                  <img alt={item.title} className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" src={item.image} />

                  {/* Blob decorativo: un brillo orgánico en la esquina de la foto, nunca tapa el sello ni el botón de reportar */}
                  <div aria-hidden="true" className="absolute -bottom-3 -right-3 w-14 h-14 bg-white/25 blob-shape-2 pointer-events-none" />

                  {/* Category Stamp label */}
                  <span className={`absolute top-2 right-2 text-[8px] font-extrabold px-1.5 py-0.5 blob-badge shadow -rotate-6 ${
                    isBarter ? 'bg-primary text-white' : 'bg-warning text-ink'
                  }`}>
                    {isBarter ? 'TRUEQUE' : 'REGALO'}
                  </span>

                  {item.tag && (
                    <span className="absolute top-2 left-2 bg-gold-light/95 backdrop-blur-sm text-primary border border-gold-border font-black text-[7px] tracking-wider px-1 rounded uppercase">
                      {item.tag}
                    </span>
                  )}

                  <button
                    id={`report-listing-btn-${item.id}`}
                    type="button"
                    title="Reportar esta publicación"
                    onClick={(e) => {
                      e.stopPropagation();
                      openReportModal(item);
                    }}
                    className="absolute bottom-1.5 right-1.5 w-5 h-5 rounded-full bg-black/40 hover:bg-black/60 flex items-center justify-center transition-colors">
                    <span className="material-symbols-rounded text-[11px] text-white">flag</span>
                  </button>
                </div>

                {/* Info and Actions */}
                <div className="p-3">
                  <div className="flex justify-between items-start mb-1.5 gap-1">
                    <h4 className="text-xs font-black text-ink leading-snug truncate flex-1">{item.title}</h4>
                    <span className="text-[9px] font-bold text-primary whitespace-nowrap">{distanceLabel(item)}</span>
                  </div>

                  {getDeliveryCaption(item) && (
                    <p className="text-[8px] text-ink-soft truncate -mt-1 mb-1.5 flex items-center gap-0.5">
                      <span className="material-symbols-rounded text-[9px]">place</span>
                      {getDeliveryCaption(item)}
                    </p>
                  )}

                  <div className="flex items-center justify-between mt-2.5 pt-2 border-t border-border">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <img alt={item.userName} className="w-5 h-5 rounded-full object-cover shrink-0 border border-border" src={item.userAvatar} />
                      <span className="text-[9px] font-semibold text-ink-soft truncate">{item.userName}</span>
                    </div>
                    
                    <button 
                      id={`chat-action-${item.id}`}
                      type="button"
                      onClick={() => {
                        addLog('Navigation: Abriendo sala de chat con el oferente', { itemTitle: item.title, userName: item.userName });
                        onStartChat(item);
                      }}
                      className="text-primary hover:underline text-[9px] font-extrabold flex items-center gap-0.5 whitespace-nowrap select-none">
                      <span>{isBarter ? 'Chatear' : 'Pedir'}</span>
                      <span className="material-symbols-rounded text-[10px]">chat</span>
                    </button>
                  </div>
                </div>

                {/* Remate inferior festoneado (opción "B") en vez de una línea recta — el color sigue marcando trueque vs. donación */}
                <div
                  aria-hidden="true"
                  className="scallop-edge-bottom"
                  style={{ backgroundColor: isBarter ? '#2D5F3E' : '#b9791e' }}
                />
              </div>
            );
          })
        )}
      </div>

      {/* Modal real para reportar una publicación/usuario */}
      {reportingItem && (
        <div
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={() => setReportingItem(null)}>
          <div
            id="report-listing-modal"
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl p-4 w-full max-w-sm shadow-xl space-y-3">
            {reportSubmitted ? (
              <div className="text-center py-3">
                <span className="material-symbols-rounded text-[32px] text-primary mb-1">check_circle</span>
                <p className="text-xs font-bold text-ink">Reporte enviado. Gracias por avisarnos.</p>
                <button
                  type="button"
                  onClick={() => setReportingItem(null)}
                  className="mt-3 w-full bg-bg-soft text-ink-soft rounded-lg py-2 text-[11px] font-bold">
                  Cerrar
                </button>
              </div>
            ) : (
              <>
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h4 className="text-sm font-black text-ink">Reportar publicación</h4>
                    <p className="text-[10px] text-ink-soft mt-0.5 truncate">"{reportingItem.title}" de {reportingItem.userName}</p>
                  </div>
                  <button type="button" onClick={() => setReportingItem(null)} className="text-ink-faint hover:text-ink-soft">
                    <span className="material-symbols-rounded text-[18px]">close</span>
                  </button>
                </div>

                <div className="space-y-1.5">
                  {REPORT_REASONS.map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReportReason(r)}
                      className={`w-full text-left px-3 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors ${
                        reportReason === r
                          ? 'bg-red-50 border-red-300 text-red-700'
                          : 'bg-white border-border text-ink-soft hover:border-border'
                      }`}>
                      {REPORT_REASON_LABELS[r]}
                    </button>
                  ))}
                </div>

                <textarea
                  id="report-comment-input"
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  rows={2}
                  maxLength={300}
                  placeholder="Contanos más (opcional)..."
                  className="w-full px-3 py-2 text-[11px] bg-bg-soft border-none rounded-lg focus:ring-2 focus:ring-red-300 focus:bg-white focus:outline-none text-ink"
                />

                {reportError && <p className="text-[10px] font-semibold text-red-600">{reportError}</p>}

                <button
                  id="report-listing-submit-btn"
                  type="button"
                  disabled={submittingReport}
                  onClick={handleSubmitReport}
                  className="w-full bg-red-600 hover:bg-red-700 text-white rounded-lg py-2 text-[11px] font-black uppercase tracking-wide disabled:opacity-60 transition-colors">
                  {submittingReport ? 'Enviando...' : 'Enviar reporte'}
                </button>

                <div className="pt-2 border-t border-border">
                  {userBlocked ? (
                    <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1 justify-center">
                      <span className="material-symbols-rounded text-[12px]">block</span>
                      Bloqueaste a {reportingItem.userName}.
                    </p>
                  ) : (
                    <button
                      id="block-user-from-report-btn"
                      type="button"
                      disabled={blockingUser}
                      onClick={handleBlockFromReport}
                      className="w-full text-[10px] font-bold text-ink-soft hover:text-red-600 disabled:opacity-60 flex items-center justify-center gap-1 py-1">
                      <span className="material-symbols-rounded text-[12px]">block</span>
                      {blockingUser ? 'Bloqueando...' : `Bloquear a ${reportingItem.userName}`}
                    </button>
                  )}
                  {blockError && <p className="text-[10px] font-semibold text-red-600 text-center mt-1">{blockError}</p>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
