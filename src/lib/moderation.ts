/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { ReportReason } from './reports';

// Un reporte pendiente, ya con los datos legibles que necesita el panel
// de moderación (nombre de quien reportó, de quien fue reportado, título
// de la publicación si corresponde) en vez de solo ids sueltos.
export interface PendingReport {
  id: string;
  reason: ReportReason;
  comment: string | null;
  createdAt: string;
  reporterId: string;
  reporterName: string;
  reportedUserId: string | null;
  reportedUserName: string | null;
  reportedListingId: string | null;
  reportedListingTitle: string | null;
  // Dueño real de la publicación reportada (puede ser distinto de
  // reportedUserId si lo que se reportó fue directamente la publicación).
  listingOwnerId: string | null;
  listingOwnerName: string | null;
}

export async function fetchPendingReports(): Promise<{ reports: PendingReport[]; error: string | null }> {
  const { data, error } = await supabase
    .from('reports')
    .select(
      `id, reason, comment, created_at, reporter_id, reported_user_id, reported_listing_id,
       reporter:user_profiles!reports_reporter_id_fkey(username, display_name),
       reported_user:user_profiles!reports_reported_user_id_fkey(username, display_name),
       reported_listing:listings(id, title, user_id, owner:user_profiles!listings_user_id_fkey(username, display_name))`
    )
    .eq('status', 'pendiente')
    .order('created_at', { ascending: false });

  if (error) {
    return { reports: [], error: error.message };
  }

  const reports: PendingReport[] = (data ?? []).map((row: any) => ({
    id: row.id,
    reason: row.reason,
    comment: row.comment,
    createdAt: row.created_at,
    reporterId: row.reporter_id,
    reporterName: row.reporter?.display_name || row.reporter?.username || 'Usuario',
    reportedUserId: row.reported_user_id,
    reportedUserName: row.reported_user ? row.reported_user.display_name || row.reported_user.username : null,
    reportedListingId: row.reported_listing_id,
    reportedListingTitle: row.reported_listing?.title ?? null,
    listingOwnerId: row.reported_listing?.user_id ?? null,
    listingOwnerName: row.reported_listing?.owner
      ? row.reported_listing.owner.display_name || row.reported_listing.owner.username
      : null,
  }));

  return { reports, error: null };
}

type ModerationAction = 'dismiss' | 'delete_listing' | 'suspend_user' | 'unsuspend_user';

async function callAdminModerate(payload: {
  action: ModerationAction;
  report_id?: string;
  listing_id?: string;
  user_id?: string;
  reason?: string;
}): Promise<{ error: string | null }> {
  const { data, error } = await supabase.functions.invoke('admin-moderate', {
    method: 'POST',
    body: payload,
  });

  if (error) {
    return { error: 'No se pudo completar la acción. Probá de nuevo en un momento.' };
  }
  if (data?.error) {
    return { error: data.error as string };
  }
  return { error: null };
}

export function dismissReport(reportId: string) {
  return callAdminModerate({ action: 'dismiss', report_id: reportId });
}

export function deleteReportedListing(reportId: string, listingId: string) {
  return callAdminModerate({ action: 'delete_listing', report_id: reportId, listing_id: listingId });
}

export function suspendReportedUser(reportId: string, userId: string, reason?: string) {
  return callAdminModerate({ action: 'suspend_user', report_id: reportId, user_id: userId, reason });
}

export function unsuspendUser(userId: string) {
  return callAdminModerate({ action: 'unsuspend_user', user_id: userId });
}
