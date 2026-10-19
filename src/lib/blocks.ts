/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

export interface BlockedUser {
  id: string;
  displayName: string;
  avatarUrl: string | null;
  blockedAt: string;
}

// Bloquea a otra persona: a partir de ahora no pueden escribirse mensajes
// nuevos ni hacerse ofertas nuevas, y sus publicaciones desaparecen de tu
// Catálogo (y las tuyas del suyo).
export async function blockUser(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from('user_blocks').insert({ blocker_id: blockerId, blocked_id: blockedId });
  return { error: error?.message ?? null };
}

// Deshace un bloqueo propio. Solo quien bloqueó puede desbloquear.
export async function unblockUser(blockerId: string, blockedId: string): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from('user_blocks')
    .delete()
    .eq('blocker_id', blockerId)
    .eq('blocked_id', blockedId);
  return { error: error?.message ?? null };
}

// Lista de usuarios que esta persona bloqueó, con nombre/foto, para
// mostrar en "Mi Perfil" y poder desbloquear desde ahí.
export async function fetchMyBlockedUsers(blockerId: string): Promise<{ blocked: BlockedUser[]; error: string | null }> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('blocked_id, created_at, blocked:user_profiles!user_blocks_blocked_id_fkey(display_name, avatar_url)')
    .eq('blocker_id', blockerId)
    .order('created_at', { ascending: false });

  if (error) {
    return { blocked: [], error: error.message };
  }

  const blocked: BlockedUser[] = ((data ?? []) as any[]).map((row) => ({
    id: row.blocked_id,
    displayName: row.blocked?.display_name ?? 'Usuario TrueK',
    avatarUrl: row.blocked?.avatar_url ?? null,
    blockedAt: row.created_at,
  }));

  return { blocked, error: null };
}

// Si YO bloqueé a esta persona (para poder ofrecer "Desbloquear").
export async function amIBlocking(blockerId: string, otherId: string): Promise<{ blocking: boolean; error: string | null }> {
  const { data, error } = await supabase
    .from('user_blocks')
    .select('id')
    .eq('blocker_id', blockerId)
    .eq('blocked_id', otherId)
    .maybeSingle();

  if (error) {
    return { blocking: false, error: error.message };
  }
  return { blocking: !!data, error: null };
}

// Todos los usuarios con los que tengo un bloqueo, en cualquiera de las
// dos direcciones -- para filtrarlos de la bandeja de conversaciones en
// una sola consulta.
export async function fetchMyBlockedPairIds(): Promise<{ ids: Set<string>; error: string | null }> {
  const { data, error } = await supabase.rpc('my_blocked_pairs');
  if (error) {
    return { ids: new Set(), error: error.message };
  }
  return { ids: new Set(((data ?? []) as { other_user_id: string }[]).map((r) => r.other_user_id)), error: null };
}

// Si hay un bloqueo entre las dos personas, en cualquier dirección (sin
// decir quién bloqueó a quién) -- para saber si ya no se pueden
// escribir, por ejemplo.
export async function isBlockedPair(a: string, b: string): Promise<{ blocked: boolean; error: string | null }> {
  const { data, error } = await supabase.rpc('is_blocked_pair', { a, b });
  if (error) {
    return { blocked: false, error: error.message };
  }
  return { blocked: !!data, error: null };
}
