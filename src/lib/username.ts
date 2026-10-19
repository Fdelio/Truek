/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

// Mismo formato que el constraint de la base: 3-20 caracteres, solo
// minúsculas/números/guión bajo.
const USERNAME_REGEX = /^[a-z0-9_]{3,20}$/;

// Pasa cualquier texto a la forma que puede tener un username real:
// minúsculas y sin caracteres fuera de [a-z0-9_]. Útil tanto para
// normalizar lo que la persona escribe como para sugerir un default a
// partir del inicio de su mail.
export function normalizeUsername(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9_]/g, '').slice(0, 20);
}

export function isValidUsernameFormat(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

// Chequea si un username está libre. "excludeUserId" sirve para que,
// cuando una persona está editando SU PROPIO username, no se marque como
// "ocupado" el que ya es suyo.
export async function isUsernameAvailable(
  username: string,
  excludeUserId?: string
): Promise<{ available: boolean; error: string | null }> {
  let query = supabase.from('user_profiles').select('id').eq('username', username).limit(1);
  if (excludeUserId) {
    query = query.neq('id', excludeUserId);
  }
  const { data, error } = await query;
  if (error) {
    return { available: false, error: error.message };
  }
  return { available: (data?.length ?? 0) === 0, error: null };
}

// Para loguearse con usuario o mail: si lo que escribió tiene "@" lo
// tratamos directamente como mail; si no, le pedimos a la base (vía una
// función con permiso propio, porque auth.users no es público) el mail
// real asociado a ese username para poder llamar signInWithPassword.
export async function resolveLoginEmail(identifier: string): Promise<{ email: string | null; error: string | null }> {
  const trimmed = identifier.trim();
  if (trimmed.includes('@')) {
    return { email: trimmed, error: null };
  }

  const { data, error } = await supabase.rpc('email_for_username', { p_username: normalizeUsername(trimmed) });
  if (error) {
    return { email: null, error: error.message };
  }
  if (!data) {
    return { email: null, error: 'No encontramos ninguna cuenta con ese nombre de usuario o mail.' };
  }
  return { email: data as string, error: null };
}
