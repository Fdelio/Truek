/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { FeedItem, PublishState } from '../types';

// Usados cuando a un listing real le falta foto o el perfil del vendedor
// todavía no tiene avatar cargado.
const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30';

// Forma cruda que devuelve la función listings_with_distance (ya trae la
// distancia real calculada en el servidor, sin exponer coordenadas).
interface ListingWithDistanceRow {
  id: string;
  user_id: string;
  title: string;
  description: string | null;
  category: string | null;
  listing_kind: 'trueque' | 'donacion';
  images: string[] | null;
  condition: string | null;
  extra_details: string | null;
  created_at: string;
  seller_display_name: string | null;
  seller_avatar_url: string | null;
  distance_km: number | null;
  delivery_mode: 'profile' | 'custom' | 'tbd';
  delivery_location_label: string | null;
  delivery_note: string | null;
}

// Convierte una fila real de listings_with_distance a la forma FeedItem
// que ya entiende la UI del Catálogo (DiscoveryView).
export function mapListingToFeedItem(row: ListingWithDistanceRow): FeedItem {
  const publishedRecently =
    Date.now() - new Date(row.created_at).getTime() < 1000 * 60 * 60 * 48; // 48hs

  const images = row.images && row.images.length > 0 ? row.images : [DEFAULT_IMAGE];

  return {
    id: row.id,
    title: row.title,
    category: row.category ?? 'General',
    type: row.listing_kind === 'donacion' ? 'donation' : 'barter',
    distance: row.distance_km,
    userName: row.seller_display_name ?? 'Usuario TrueK',
    userAvatar: row.seller_avatar_url ?? DEFAULT_AVATAR,
    sellerId: row.user_id,
    image: images[0],
    images,
    description: row.description,
    condition: row.condition,
    extraDetails: row.extra_details,
    tag: publishedRecently ? 'RECIÉN PUBLICADO' : undefined,
    deliveryMode: row.delivery_mode,
    deliveryLocationLabel: row.delivery_location_label,
    deliveryNote: row.delivery_note,
  };
}

// Trae del backend real los listings activos (status = 'disponible'),
// más nuevos primero, con el nombre/avatar del vendedor y la distancia
// real ya calculada en el servidor (fórmula de Haversine) a partir de la
// ubicación de quien mira el catálogo. Si no tenemos la ubicación de
// quien mira (viewerLat/viewerLng null) o la del vendedor, distance_km
// viene en null — nunca se inventa un "0 km".
export async function fetchActiveListings(
  viewerLat: number | null,
  viewerLng: number | null
): Promise<{ items: FeedItem[]; error: string | null }> {
  // v3: igual que v2 (distancia con la ubicación de entrega propia de cada
  // publicación cuando la tiene, modo de entrega + nota libre) pero además
  // trae la descripción completa y los campos opcionales de detalle
  // (estado del producto, medidas/otros) para la pantalla de detalle.
  const { data, error } = await supabase.rpc('listings_with_distance_v3', {
    viewer_lat: viewerLat,
    viewer_lng: viewerLng,
  });

  if (error) {
    return { items: [], error: error.message };
  }

  return { items: ((data ?? []) as ListingWithDistanceRow[]).map(mapListingToFeedItem), error: null };
}

// Convierte lo que haya en el input de precio en créditos a número, o a
// null si todavía está vacío (válido mientras el listing sea un borrador).
function parseCreditValue(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

// Arma el objeto que se manda a Supabase a partir del formulario de
// "Posteo", para el estado 'disponible' (publicación real) o 'borrador'.
// Las donaciones siempre van como exchange_type 'objeto' sin credit_value
// (la base lo exige: listing_credit_value_check). Los trueques pueden
// pedir un objeto, créditos, o ambos — en esos dos últimos casos hace
// falta un credit_value numérico, salvo que todavía sea un borrador a medio
// completar.
function buildListingPayload(userId: string, publishState: PublishState, status: 'disponible' | 'borrador') {
  const images = publishState.photos.map((p) => p.url).filter(Boolean);

  const isDonation = publishState.listingType === 'donation';
  const exchangeType = isDonation ? 'objeto' : publishState.exchangeType;
  const needsCreditValue = exchangeType === 'creditos' || exchangeType === 'ambos';
  const creditValue = needsCreditValue ? parseCreditValue(publishState.creditValue) : null;

  // Las coordenadas/etiqueta de entrega solo tienen sentido con modo
  // 'custom' — en 'profile' y 'tbd' siempre van en null, aunque hayan
  // quedado seteadas de un cambio de modo anterior.
  const isCustomDelivery = publishState.deliveryMode === 'custom';

  return {
    user_id: userId,
    title: publishState.title.trim(),
    description: publishState.description.trim() || null,
    category: publishState.category || null,
    images,
    condition: publishState.condition.trim() || null,
    extra_details: publishState.extraDetails.trim() || null,
    listing_kind: isDonation ? 'donacion' : 'trueque',
    exchange_type: exchangeType,
    credit_value: creditValue,
    status,
    delivery_mode: publishState.deliveryMode,
    delivery_lat: isCustomDelivery ? publishState.deliveryLat : null,
    delivery_lng: isCustomDelivery ? publishState.deliveryLng : null,
    delivery_location_label: isCustomDelivery ? publishState.deliveryLocationLabel : null,
    // (publishState.deliveryNote ?? '') por las dudas: así nunca explota
    // si en algún momento llega undefined en vez de string vacío.
    delivery_note: (publishState.deliveryNote ?? '').trim() || null,
  };
}

// Guarda el formulario de "Posteo" en Supabase, como publicación real
// (status 'disponible') o como borrador (status 'borrador'). Si
// publishState.draftId ya apunta a un borrador propio, lo actualiza en
// vez de crear una fila nueva cada vez que se guarda — así "Guardar
// borrador" varias veces no deja copias duplicadas.
export async function saveListing(
  userId: string,
  publishState: PublishState,
  status: 'disponible' | 'borrador'
): Promise<{ id: string | null; error: string | null }> {
  const payload = buildListingPayload(userId, publishState, status);

  if (publishState.draftId) {
    const { data, error } = await supabase
      .from('listings')
      .update(payload)
      .eq('id', publishState.draftId)
      .eq('user_id', userId)
      .select('id')
      .single();

    if (error) {
      return { id: null, error: error.message };
    }
    return { id: (data as { id: string }).id, error: null };
  }

  const { data, error } = await supabase.from('listings').insert(payload).select('id').single();

  if (error) {
    return { id: null, error: error.message };
  }

  return { id: (data as { id: string }).id, error: null };
}

// Forma compartida para cualquier publicación propia que el usuario puede
// volver a cargar en el formulario de "Posteo" —sea un borrador a medio
// completar o una publicación ya activa que quiere corregir. DraftListing
// queda como alias por compatibilidad con el código existente.
export interface OwnedListing {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  images: string[];
  listingType: 'barter' | 'donation';
  exchangeType: 'objeto' | 'creditos' | 'ambos';
  creditValue: number | null;
  updatedAt: string;
  deliveryMode: 'profile' | 'custom' | 'tbd';
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLocationLabel: string | null;
  deliveryNote: string | null;
  condition: string | null;
  extraDetails: string | null;
}

export type DraftListing = OwnedListing;

interface OwnedListingRow {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  images: string[] | null;
  listing_kind: 'trueque' | 'donacion';
  exchange_type: 'objeto' | 'creditos' | 'ambos';
  credit_value: number | null;
  updated_at: string;
  delivery_mode: 'profile' | 'custom' | 'tbd';
  delivery_lat: number | null;
  delivery_lng: number | null;
  delivery_location_label: string | null;
  delivery_note: string | null;
  condition: string | null;
  extra_details: string | null;
}

const OWNED_LISTING_SELECT =
  'id, title, description, category, images, listing_kind, exchange_type, credit_value, updated_at, delivery_mode, delivery_lat, delivery_lng, delivery_location_label, delivery_note, condition, extra_details';

function mapOwnedListingRow(row: OwnedListingRow): OwnedListing {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    category: row.category,
    images: row.images ?? [],
    listingType: row.listing_kind === 'donacion' ? 'donation' : 'barter',
    exchangeType: row.exchange_type,
    creditValue: row.credit_value,
    updatedAt: row.updated_at,
    deliveryMode: row.delivery_mode,
    deliveryLat: row.delivery_lat,
    deliveryLng: row.delivery_lng,
    deliveryLocationLabel: row.delivery_location_label,
    deliveryNote: row.delivery_note,
    condition: row.condition,
    extraDetails: row.extra_details,
  };
}

// Trae las publicaciones propias con un status dado, la más recientemente
// editada primero. Son privadas (si es un borrador, la RLS de la base
// solo deja verlo a su dueño) o de todos modos solo las propias.
async function fetchMyListingsByStatus(
  userId: string,
  status: 'borrador' | 'disponible'
): Promise<{ listings: OwnedListing[]; error: string | null }> {
  const { data, error } = await supabase
    .from('listings')
    .select(OWNED_LISTING_SELECT)
    .eq('user_id', userId)
    .eq('status', status)
    .order('updated_at', { ascending: false });

  if (error) {
    return { listings: [], error: error.message };
  }

  return { listings: ((data ?? []) as OwnedListingRow[]).map(mapOwnedListingRow), error: null };
}

// Trae todos los borradores propios (status = 'borrador').
export async function fetchMyDrafts(userId: string): Promise<{ drafts: DraftListing[]; error: string | null }> {
  const { listings, error } = await fetchMyListingsByStatus(userId, 'borrador');
  return { drafts: listings, error };
}

// Trae las publicaciones propias ya activas (status = 'disponible'), para
// poder editarlas o despublicarlas desde "Posteo".
export async function fetchMyActiveListings(
  userId: string
): Promise<{ listings: OwnedListing[]; error: string | null }> {
  return fetchMyListingsByStatus(userId, 'disponible');
}

// Borra un borrador propio para siempre.
export async function deleteDraft(userId: string, draftId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('listings').delete().eq('id', draftId).eq('user_id', userId);
  return { error: error?.message ?? null };
}

// "Despublica" una publicación propia ya activa: la pasa a 'borrador' en
// vez de borrarla, así desaparece del Catálogo pero queda guardada en
// "Mis borradores" —el dueño puede seguir editándola y volver a
// publicarla cuando quiera, en vez de perderla para siempre.
export async function pauseListing(userId: string, listingId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('listings')
    .update({ status: 'borrador' })
    .eq('id', listingId)
    .eq('user_id', userId);
  return { error: error?.message ?? null };
}
