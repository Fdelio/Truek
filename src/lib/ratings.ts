/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

// Un trueque cerrado (trade_offer con status 'aceptada') que el usuario
// actual todavía no calificó, con los datos de la otra parte y de la
// publicación para poder mostrar el cartel de "Calificá a..." sin pegarle
// más consultas a la base.
export interface PendingRating {
  offerId: string;
  listingId: string;
  listingTitle: string;
  listingImage: string | null;
  counterpartId: string;
  counterpartName: string;
  counterpartAvatar: string | null;
  closedAt: string;
}

interface PendingRatingRow {
  offer_id: string;
  listing_id: string;
  listing_title: string;
  listing_image: string | null;
  counterpart_id: string;
  counterpart_name: string | null;
  counterpart_avatar: string | null;
  closed_at: string;
}

function mapPendingRatingRow(row: PendingRatingRow): PendingRating {
  return {
    offerId: row.offer_id,
    listingId: row.listing_id,
    listingTitle: row.listing_title,
    listingImage: row.listing_image,
    counterpartId: row.counterpart_id,
    counterpartName: row.counterpart_name ?? 'Usuario TrueK',
    counterpartAvatar: row.counterpart_avatar,
    closedAt: row.closed_at,
  };
}

// Trueques ya cerrados en los que el usuario participó y todavía no dejó
// su calificación de la otra parte. La función de la base ya filtra todo
// esto (participante + aceptada + sin calificación previa).
export async function fetchMyPendingRatings(): Promise<{ pending: PendingRating[]; error: string | null }> {
  const { data, error } = await supabase.rpc('my_pending_ratings');

  if (error) {
    return { pending: [], error: error.message };
  }

  return { pending: ((data ?? []) as PendingRatingRow[]).map(mapPendingRatingRow), error: null };
}

// Califica a la otra parte de un trueque cerrado puntual. La función de la
// base valida que el trueque esté 'aceptada', que quien llama haya sido
// parte de él, y que no lo haya calificado antes — así que un error acá
// siempre es un mensaje legible para mostrar directo en la UI.
export async function submitTradeRating(
  offerId: string,
  stars: number,
  comment: string
): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('submit_trade_rating', {
    p_offer_id: offerId,
    p_stars: stars,
    p_comment: comment.trim() || null,
  });
  return { error: error?.message ?? null };
}

// Si el usuario actual ya calificó un trueque puntual (para no mostrarle
// de nuevo el formulario de calificación una vez que ya lo hizo).
export async function hasRatedOffer(offerId: string, userId: string): Promise<{ rated: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('trade_ratings')
    .select('id')
    .eq('offer_id', offerId)
    .eq('rater_id', userId)
    .maybeSingle();

  if (error) {
    return { rated: false, error: error.message };
  }
  return { rated: !!data, error: null };
}

export interface RatingSummary {
  average: number | null;
  total: number;
}

// Una calificación real recibida, con el nombre/foto de quien la dejó
// (para mostrarla en "Mi Perfil").
export interface ReceivedRating {
  id: string;
  stars: number;
  comment: string | null;
  createdAt: string;
  raterName: string;
  raterAvatar: string | null;
}

interface ReceivedRatingRow {
  id: string;
  stars: number;
  comment: string | null;
  created_at: string;
  rater: { display_name: string | null; avatar_url: string | null } | null;
}

// Las calificaciones reales que este usuario recibió de otras personas,
// más nuevas primero (para mostrarlas en "Mi Perfil").
export async function fetchReceivedRatings(userId: string): Promise<{ ratings: ReceivedRating[]; error: string | null }> {
  const { data, error } = await supabase
    .from('trade_ratings')
    .select('id, stars, comment, created_at, rater:user_profiles!trade_ratings_rater_id_fkey(display_name, avatar_url)')
    .eq('rated_id', userId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    return { ratings: [], error: error.message };
  }

  const ratings = ((data ?? []) as unknown as ReceivedRatingRow[]).map((row) => ({
    id: row.id,
    stars: row.stars,
    comment: row.comment,
    createdAt: row.created_at,
    raterName: row.rater?.display_name ?? 'Usuario TrueK',
    raterAvatar: row.rater?.avatar_url ?? null,
  }));

  return { ratings, error: null };
}

// Promedio real (1 a 5 estrellas) y cantidad de calificaciones recibidas
// por un usuario. average null = todavía no tiene ninguna.
export async function fetchRatingSummary(userId: string): Promise<{ summary: RatingSummary; error: string | null }> {
  const { data, error } = await supabase
    .from('user_rating_summary')
    .select('average_stars, total_ratings')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    return { summary: { average: null, total: 0 }, error: error.message };
  }

  if (!data) {
    return { summary: { average: null, total: 0 }, error: null };
  }

  return {
    summary: { average: Number((data as any).average_stars), total: (data as any).total_ratings },
    error: null,
  };
}
