/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

export interface TradeOffer {
  id: string;
  fromUserId: string;
  // Quién hizo la última movida (propuesta original o contraoferta). Así
  // la UI sabe de quién es el turno de responder.
  lastActorId: string;
  offerType: 'objeto' | 'creditos';
  offeredListingId: string | null;
  offeredListingTitle: string | null;
  offeredCredits: number | null;
  message: string | null;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada';
  createdAt: string;
  // Una vez 'aceptada', el trueque todavía no está realmente cerrado: hay
  // que coordinar la entrega y que CADA parte confirme que la recibió.
  // buyerConfirmedAt/sellerConfirmedAt quedan en null hasta que esa
  // persona puntual confirma; deliveredAt recién se completa cuando las
  // dos lo hicieron (ahí se liberan los créditos en espera y se puede
  // calificar).
  buyerConfirmedAt: string | null;
  sellerConfirmedAt: string | null;
  deliveredAt: string | null;
}

interface TradeOfferRow {
  id: string;
  from_user_id: string;
  last_actor_id: string;
  offer_type: 'objeto' | 'creditos';
  offered_listing_id: string | null;
  offered_credits: number | null;
  message: string | null;
  status: 'pendiente' | 'aceptada' | 'rechazada' | 'cancelada';
  created_at: string;
  buyer_confirmed_at: string | null;
  seller_confirmed_at: string | null;
  delivered_at: string | null;
}

// Trae todas las propuestas (pendientes, aceptadas, rechazadas, canceladas)
// que este comprador hizo sobre este listing puntual — ni más ni menos que
// lo que corresponde a una conversación (listing + comprador). Incluye las
// contraofertas del vendedor, porque esas actualizan la MISMA fila en vez
// de crear una nueva (from_user_id sigue siendo siempre el comprador).
export async function fetchOffers(
  listingId: string,
  buyerId: string
): Promise<{ offers: TradeOffer[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trade_offers')
    .select(
      'id, from_user_id, last_actor_id, offer_type, offered_listing_id, offered_credits, message, status, created_at, buyer_confirmed_at, seller_confirmed_at, delivered_at'
    )
    .eq('listing_id', listingId)
    .eq('from_user_id', buyerId)
    .order('created_at', { ascending: false });

  if (error) {
    return { offers: [], error: error.message };
  }

  const rows = (data ?? []) as TradeOfferRow[];
  const offeredListingIds = Array.from(
    new Set(rows.map((r) => r.offered_listing_id).filter((id): id is string => !!id))
  );

  let titlesById = new Map<string, string>();
  if (offeredListingIds.length > 0) {
    const { data: listingsData } = await supabase.from('listings').select('id, title').in('id', offeredListingIds);
    titlesById = new Map((listingsData ?? []).map((l: any) => [l.id, l.title]));
  }

  const offers: TradeOffer[] = rows.map((r) => ({
    id: r.id,
    fromUserId: r.from_user_id,
    lastActorId: r.last_actor_id,
    offerType: r.offer_type,
    offeredListingId: r.offered_listing_id,
    offeredListingTitle: r.offered_listing_id ? titlesById.get(r.offered_listing_id) ?? 'Publicación' : null,
    offeredCredits: r.offered_credits,
    message: r.message,
    status: r.status,
    createdAt: r.created_at,
    buyerConfirmedAt: r.buyer_confirmed_at,
    sellerConfirmedAt: r.seller_confirmed_at,
    deliveredAt: r.delivered_at,
  }));

  return { offers, error: null };
}

// Publicaciones propias y disponibles (para elegir cuál ofrecer a cambio).
export async function fetchMyAvailableListings(
  userId: string,
  excludeListingId?: string
): Promise<{ listings: { id: string; title: string; image: string }[]; error: string | null }> {
  let query = supabase
    .from('listings')
    .select('id, title, images')
    .eq('user_id', userId)
    .eq('status', 'disponible');

  if (excludeListingId) {
    query = query.neq('id', excludeListingId);
  }

  const { data, error } = await query.order('created_at', { ascending: false });

  if (error) {
    return { listings: [], error: error.message };
  }

  return {
    listings: (data ?? []).map((l: any) => ({
      id: l.id,
      title: l.title,
      image: l.images?.[0] ?? '',
    })),
    error: null,
  };
}

export async function createCreditsOffer(
  listingId: string,
  fromUserId: string,
  credits: number,
  message: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trade_offers').insert({
    listing_id: listingId,
    from_user_id: fromUserId,
    offer_type: 'creditos',
    offered_credits: credits,
    message: message || null,
  });

  return { error: error?.message ?? null };
}

export async function createObjectOffer(
  listingId: string,
  fromUserId: string,
  offeredListingId: string,
  message: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('trade_offers').insert({
    listing_id: listingId,
    from_user_id: fromUserId,
    offer_type: 'objeto',
    offered_listing_id: offeredListingId,
    message: message || null,
  });

  return { error: error?.message ?? null };
}

// Estas tres solo llaman a las funciones reales de la base (accept/reject/
// cancel_trade_offer) que ya hacen todo el trabajo pesado: mover créditos,
// dejar el registro en credit_transactions, y marcar los listings como
// completados. Nunca hay que actualizar trade_offers.status a mano desde
// el cliente — si no, el intercambio quedaría "aceptado" sin que los
// créditos realmente se muevan.
export async function acceptOffer(offerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('accept_trade_offer', { p_offer_id: offerId });
  return { error: error?.message ?? null };
}

export async function rejectOffer(offerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('reject_trade_offer', { p_offer_id: offerId });
  return { error: error?.message ?? null };
}

export async function cancelOffer(offerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_trade_offer', { p_offer_id: offerId });
  return { error: error?.message ?? null };
}

// Una vez aceptada, el trueque queda "en curso" (créditos en espera,
// publicaciones reservadas) hasta que cada parte confirme por su lado que
// la entrega real ya pasó. Esta función la llama cualquiera de las dos
// partes cuando le toca confirmar su mitad. bothConfirmed=true significa
// que con esta confirmación el trueque quedó totalmente cerrado de
// verdad (créditos transferidos, publicaciones completadas, ya se puede
// calificar) — bothConfirmed=false significa que falta que confirme la
// otra persona.
export async function confirmDelivery(offerId: string): Promise<{ bothConfirmed: boolean | null; error: string | null }> {
  const { data, error } = await supabase.rpc('confirm_trade_delivery', { p_offer_id: offerId });
  if (error) {
    return { bothConfirmed: null, error: error.message };
  }
  return { bothConfirmed: data as boolean, error: null };
}

// Cancela un trueque ya aceptado pero todavía no entregado (p.ej. si la
// coordinación por chat no llegó a nada). Devuelve los créditos "en
// espera" a quien los ofreció y las publicaciones vuelven a estar
// disponibles. Solo funciona mientras nadie confirmó la entrega todavía
// del todo (la base lo valida).
export async function cancelConfirmedTrade(offerId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('cancel_confirmed_trade', { p_offer_id: offerId });
  return { error: error?.message ?? null };
}

// Un trueque aceptado (créditos/publicaciones ya reservados) que todavía
// no se cerró de verdad -- a alguno de los dos (o a los dos) le falta
// confirmar la entrega. Trae todo lo necesario para mostrarlo en una
// lista y poder saltar directo a ese chat sin tener que ir conversación
// por conversación buscándolo.
export interface PendingDelivery {
  offerId: string;
  conversationId: string | null;
  listingId: string;
  listingTitle: string;
  listingImage: string | null;
  buyerId: string;
  sellerId: string;
  counterpartId: string;
  counterpartName: string;
  counterpartAvatar: string | null;
  // true = ya confirmaste tu parte; false = te toca confirmar a vos.
  iConfirmed: boolean;
  // true = la otra persona ya confirmó la suya.
  otherConfirmed: boolean;
  acceptedAt: string | null;
}

interface PendingDeliveryRow {
  offer_id: string;
  conversation_id: string | null;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  buyer_id: string;
  seller_id: string;
  counterpart_id: string;
  counterpart_name: string | null;
  counterpart_avatar: string | null;
  i_confirmed: boolean;
  other_confirmed: boolean;
  accepted_at: string | null;
}

export async function fetchMyPendingDeliveries(): Promise<{ deliveries: PendingDelivery[]; error: string | null }> {
  const { data, error } = await supabase.rpc('my_pending_deliveries');

  if (error) {
    return { deliveries: [], error: error.message };
  }

  const deliveries: PendingDelivery[] = ((data ?? []) as PendingDeliveryRow[]).map((row) => ({
    offerId: row.offer_id,
    conversationId: row.conversation_id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingImage: row.listing_image,
    buyerId: row.buyer_id,
    sellerId: row.seller_id,
    counterpartId: row.counterpart_id,
    counterpartName: row.counterpart_name ?? 'Usuario TrueK',
    counterpartAvatar: row.counterpart_avatar,
    iConfirmed: row.i_confirmed,
    otherConfirmed: row.other_confirmed,
    acceptedAt: row.accepted_at,
  }));

  return { deliveries, error: null };
}

// Contraoferta: cualquiera de las dos partes (comprador o vendedor) puede
// proponer un nuevo monto en créditos, pero solo cuando es su turno (la
// otra parte hizo la última movida). La función de la base valida todo
// esto — acá solo la llamamos.
export async function counterOffer(
  offerId: string,
  credits: number,
  message: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('counter_trade_offer', {
    p_offer_id: offerId,
    p_credits: credits,
    p_message: message || null,
  });
  return { error: error?.message ?? null };
}
