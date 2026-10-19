/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

// Actualiza nombre, bio y/o username reales del perfil. Los tres son
// opcionales para poder llamar esta función con solo lo que cambió.
// Si el username ya está en uso, Postgres rechaza el update por el
// constraint "unique" (código 23505) y lo traducimos a un mensaje claro.
export async function updateProfileInfo(
  userId: string,
  fields: { displayName?: string; bio?: string | null; username?: string }
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {};
  if (fields.displayName !== undefined) payload.display_name = fields.displayName;
  if (fields.bio !== undefined) payload.bio = fields.bio;
  if (fields.username !== undefined) payload.username = fields.username;

  const { error } = await supabase.from('user_profiles').update(payload).eq('id', userId);
  if (error) {
    const friendlyMsg =
      error.code === '23505'
        ? 'Ese nombre de usuario ya está en uso. Probá con otro.'
        : error.code === '23514'
        ? 'El nombre de usuario tiene que tener entre 3 y 20 caracteres, solo minúsculas, números o guión bajo.'
        : error.message;
    return { error: friendlyMsg };
  }
  return { error: null };
}

// Guarda una ubicación real (con coordenadas) ya resuelta —ya sea por GPS
// o por una búsqueda de dirección— como la ubicación del perfil.
export async function updateProfileLocation(
  userId: string,
  location: string,
  lat: number,
  lng: number
): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_profiles').update({ location, lat, lng }).eq('id', userId);
  return { error: error?.message ?? null };
}

const MAX_AVATAR_BYTES = 10 * 1024 * 1024; // 10MB, igual al límite del bucket

// Sube una foto de perfil real a Supabase Storage (reusa el bucket
// 'listing-images' bajo una carpeta "avatars/" propia —las políticas de
// ese bucket son por bucket, no por carpeta, así que esto ya queda
// cubierto por las mismas reglas de "cada usuario sube/borra solo lo
// suyo"— y guarda la URL pública en el perfil real.
export async function uploadAvatar(userId: string, file: File): Promise<{ url: string | null; error: string | null }> {
  if (file.size > MAX_AVATAR_BYTES) {
    return {
      url: null,
      error: `La foto pesa ${(file.size / (1024 * 1024)).toFixed(1)}MB y el máximo permitido es 10MB. Probá con una foto más liviana.`,
    };
  }

  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'jpg';
  const path = `avatars/${userId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

  const { error: uploadErr } = await supabase.storage.from('listing-images').upload(path, file, {
    cacheControl: '3600',
    upsert: false,
  });

  if (uploadErr) {
    const msg = uploadErr.message || '';
    const friendlyMsg = /too large|EntityTooLarge|413/i.test(msg)
      ? 'La foto es demasiado pesada (máximo 10MB). Probá con otra o comprimila.'
      : /mime type|not supported|415/i.test(msg)
      ? 'Ese formato de imagen no está soportado. Usá JPG, PNG, WEBP o GIF.'
      : 'No se pudo subir la foto. Intentá de nuevo.';
    return { url: null, error: friendlyMsg };
  }

  const { data } = supabase.storage.from('listing-images').getPublicUrl(path);
  const publicUrl = data.publicUrl;

  const { error: updateErr } = await supabase.from('user_profiles').update({ avatar_url: publicUrl }).eq('id', userId);
  if (updateErr) {
    return { url: null, error: updateErr.message };
  }

  return { url: publicUrl, error: null };
}
