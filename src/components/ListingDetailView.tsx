/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { FeedItem } from '../types';
import { formatDistance } from '../lib/geo';

function distanceLabel(item: FeedItem): string {
  if (item.deliveryMode === 'tbd') return 'A definir';
  return formatDistance(item.distance);
}

function getDeliveryCaption(item: FeedItem): string | null {
  if (item.deliveryMode === 'tbd') {
    return item.deliveryNote ? `A definir: ${item.deliveryNote}` : 'A definir por chat';
  }
  if (item.deliveryMode === 'custom' && item.deliveryLocationLabel) {
    return `Entrega en ${item.deliveryLocationLabel}`;
  }
  return item.deliveryNote || null;
}

interface ListingDetailViewProps {
  item: FeedItem;
  onClose: () => void;
  onStartChat: (item: FeedItem) => void;
  onReport: (item: FeedItem) => void;
}

// Pantalla de detalle de una publicación: galería de fotos que se puede
// ampliar a pantalla completa, y todos los datos del artículo (incluidos
// los campos opcionales de estado/detalle, cuando quien publicó los
// completó). Se abre al hacer click en una card del Catálogo.
export default function ListingDetailView({ item, onClose, onStartChat, onReport }: ListingDetailViewProps) {
  const [photoIndex, setPhotoIndex] = useState(0);
  // Si está en null, la galería se ve en tamaño normal dentro de la
  // pantalla de detalle. Si tiene un número, esa foto se ve ampliada,
  // tapando toda la pantalla.
  const [zoomedIndex, setZoomedIndex] = useState<number | null>(null);

  const isBarter = item.type === 'barter';
  const photos = item.images.length > 0 ? item.images : [item.image];

  const goTo = (delta: number, setter: (i: number) => void, current: number) => {
    const next = (current + delta + photos.length) % photos.length;
    setter(next);
  };

  return (
    <div id="listing-detail-view" className="fixed inset-0 z-40 bg-canvas overflow-y-auto">
      <div className="w-full max-w-lg mx-auto pb-6">
        <button
          type="button"
          onClick={onClose}
          className="sticky top-0 left-0 z-10 m-3 bg-black/40 hover:bg-black/60 text-white rounded-full w-8 h-8 flex items-center justify-center backdrop-blur-sm">
          <span className="material-symbols-rounded text-[18px]">arrow_back</span>
        </button>

        {/* Galería: foto principal + flechas si hay más de una, y un tap
            abre la vista ampliada de pantalla completa. */}
        <div className="relative -mt-11 aspect-square bg-bg-soft overflow-hidden">
          <img
            id="listing-detail-main-photo"
            alt={item.title}
            className="w-full h-full object-cover cursor-zoom-in"
            src={photos[photoIndex]}
            onClick={() => setZoomedIndex(photoIndex)}
          />
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={() => goTo(-1, setPhotoIndex, photoIndex)}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center">
                <span className="material-symbols-rounded text-[16px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={() => goTo(1, setPhotoIndex, photoIndex)}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-black/40 hover:bg-black/60 text-white rounded-full w-7 h-7 flex items-center justify-center">
                <span className="material-symbols-rounded text-[16px]">chevron_right</span>
              </button>
              <div className="absolute bottom-2 left-0 right-0 flex justify-center gap-1">
                {photos.map((_, i) => (
                  <span
                    key={i}
                    className={`w-1.5 h-1.5 rounded-full ${i === photoIndex ? 'bg-white' : 'bg-white/40'}`}
                  />
                ))}
              </div>
            </>
          )}
          <span className="absolute top-2 right-2 bg-black/40 text-white text-[9px] font-bold px-2 py-0.5 rounded-full flex items-center gap-1">
            <span className="material-symbols-rounded text-[12px]">zoom_in</span>
            Ampliar
          </span>
        </div>

        <div className="px-4 pt-4 space-y-4">
          <div>
            <div className="flex items-start justify-between gap-2">
              <h1 className="font-display text-lg font-black text-ink-dark leading-tight">{item.title}</h1>
              <span className={`shrink-0 text-[9px] font-extrabold px-2 py-0.5 rounded-full ${
                isBarter ? 'bg-primary text-white' : 'bg-warning text-ink'
              }`}>
                {isBarter ? 'TRUEQUE' : 'REGALO'}
              </span>
            </div>
            <p className="text-[11px] text-ink-soft mt-1">{item.category}</p>
          </div>

          <div className="flex items-center gap-2 text-xs text-ink-soft">
            <span className="material-symbols-rounded text-[14px] text-primary">place</span>
            <span className="font-semibold text-primary">{distanceLabel(item)}</span>
            {getDeliveryCaption(item) && <span>· {getDeliveryCaption(item)}</span>}
          </div>

          {item.condition && (
            <div>
              <h2 className="text-[11px] font-bold text-primary-dark uppercase tracking-wide">Estado</h2>
              <p className="text-sm text-ink mt-0.5">{item.condition}</p>
            </div>
          )}

          {item.description && (
            <div>
              <h2 className="text-[11px] font-bold text-primary-dark uppercase tracking-wide">Descripción</h2>
              <p className="text-sm text-ink mt-0.5 leading-relaxed whitespace-pre-wrap">{item.description}</p>
            </div>
          )}

          {item.extraDetails && (
            <div>
              <h2 className="text-[11px] font-bold text-primary-dark uppercase tracking-wide">Medidas / otros detalles</h2>
              <p className="text-sm text-ink mt-0.5 leading-relaxed">{item.extraDetails}</p>
            </div>
          )}

          <div className="flex items-center justify-between pt-3 border-t border-border">
            <div className="flex items-center gap-2 min-w-0">
              <img alt={item.userName} className="w-8 h-8 rounded-full object-cover shrink-0 border border-border" src={item.userAvatar} />
              <span className="text-xs font-semibold text-ink-soft truncate">{item.userName}</span>
            </div>
            <button
              type="button"
              onClick={() => onReport(item)}
              className="text-[10px] font-semibold text-ink-faint hover:text-red-600 flex items-center gap-1">
              <span className="material-symbols-rounded text-[13px]">flag</span>
              Reportar
            </button>
          </div>

          <button
            id="listing-detail-chat-btn"
            type="button"
            onClick={() => onStartChat(item)}
            className="w-full bg-primary hover:bg-primary-dark text-white rounded-xl py-3 text-sm font-extrabold flex items-center justify-center gap-1.5 active:scale-95 transition-all">
            <span>{isBarter ? 'Chatear' : 'Pedir'}</span>
            <span className="material-symbols-rounded text-[16px]">chat</span>
          </button>
        </div>
      </div>

      {/* Vista ampliada de pantalla completa de una foto */}
      {zoomedIndex !== null && (
        <div
          id="listing-detail-zoom-overlay"
          className="fixed inset-0 z-50 bg-black flex items-center justify-center"
          onClick={() => setZoomedIndex(null)}>
          <img
            alt={item.title}
            className="max-w-full max-h-full object-contain"
            src={photos[zoomedIndex]}
            onClick={(e) => e.stopPropagation()}
          />
          <button
            type="button"
            onClick={() => setZoomedIndex(null)}
            className="absolute top-3 right-3 bg-white/15 hover:bg-white/25 text-white rounded-full w-9 h-9 flex items-center justify-center">
            <span className="material-symbols-rounded text-[20px]">close</span>
          </button>
          {photos.length > 1 && (
            <>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(-1, setZoomedIndex, zoomedIndex);
                }}
                className="absolute left-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white rounded-full w-9 h-9 flex items-center justify-center">
                <span className="material-symbols-rounded text-[20px]">chevron_left</span>
              </button>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  goTo(1, setZoomedIndex, zoomedIndex);
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 bg-white/15 hover:bg-white/25 text-white rounded-full w-9 h-9 flex items-center justify-center">
                <span className="material-symbols-rounded text-[20px]">chevron_right</span>
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
