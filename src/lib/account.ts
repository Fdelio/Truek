/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

// Borra para siempre la cuenta del usuario actual: perfil, publicaciones,
// ofertas de trueque, conversaciones, mensajes, créditos, calificaciones --
// todo lo que le pertenece (las foreign keys con ON DELETE CASCADE en la
// base se encargan de arrastrarlo todo). El borrado real corre en una Edge
// Function de Supabase, porque requiere la service role key, que nunca debe
// viajar al navegador. Si sale bien, también cerramos la sesión local acá
// mismo para que la app vuelva de una a la pantalla de ingreso.
export async function deleteMyAccount(): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('delete-account', {
    method: 'POST',
  });

  if (error) {
    return { error: 'No se pudo eliminar la cuenta. Probá de nuevo en un momento.' };
  }
  if (data?.error) {
    return { error: data.error as string };
  }

  await supabase.auth.signOut();
  return { error: null };
}
