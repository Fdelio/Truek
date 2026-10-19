/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';

export type ReportReason = 'spam' | 'estafa' | 'contenido_inapropiado' | 'no_corresponde' | 'otro';

export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  spam: 'Spam o publicidad',
  estafa: 'Estafa o intento de fraude',
  contenido_inapropiado: 'Contenido inapropiado',
  no_corresponde: 'No corresponde a esta categoría',
  otro: 'Otro motivo',
};

// Reporta una publicación y/o a un usuario (al menos uno de los dos). Es
// de buena fe: no hay límite ni confirmación aparte -- queda guardado
// para que alguien lo revise directo en la base. Nadie, ni quien lo
// manda, puede verlo después ni editarlo.
export async function submitReport(params: {
  reporterId: string;
  reportedUserId?: string | null;
  reportedListingId?: string | null;
  reason: ReportReason;
  comment?: string;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from('reports').insert({
    reporter_id: params.reporterId,
    reported_user_id: params.reportedUserId ?? null,
    reported_listing_id: params.reportedListingId ?? null,
    reason: params.reason,
    comment: params.comment?.trim() || null,
  });
  return { error: error?.message ?? null };
}
