/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import TruekMascot from './TruekMascot';
import { REPORT_REASON_LABELS } from '../lib/reports';
import {
  PendingReport,
  fetchPendingReports,
  dismissReport,
  deleteReportedListing,
  suspendReportedUser,
} from '../lib/moderation';

interface ModerationViewProps {
  addLog: (title: string, data: any) => void;
}

export default function ModerationView({ addLog }: ModerationViewProps) {
  const [reports, setReports] = useState<PendingReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Qué reporte tiene abierto el cuadro de "¿por qué suspendés?", si alguno.
  const [suspendPromptFor, setSuspendPromptFor] = useState<string | null>(null);
  const [suspendReasonInput, setSuspendReasonInput] = useState('');
  const [actingReportId, setActingReportId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = () => {
    setLoading(true);
    setLoadError(null);
    fetchPendingReports().then(({ reports: fetched, error }) => {
      setLoading(false);
      if (error) {
        setLoadError(error);
        addLog('Moderación: error al cargar reportes pendientes', { message: error });
        return;
      }
      setReports(fetched);
      addLog('Moderación: reportes pendientes cargados', { total: fetched.length });
    });
  };

  useEffect(() => {
    load();
  }, []);

  const handleDismiss = async (report: PendingReport) => {
    setActingReportId(report.id);
    setActionError(null);
    const { error } = await dismissReport(report.id);
    setActingReportId(null);
    if (error) {
      setActionError(error);
      addLog('Moderación: error al descartar reporte', { message: error });
      return;
    }
    addLog('Moderación: reporte descartado', { reportId: report.id });
    setReports((prev) => prev.filter((r) => r.id !== report.id));
  };

  const handleDeleteListing = async (report: PendingReport) => {
    if (!report.reportedListingId) return;
    setActingReportId(report.id);
    setActionError(null);
    const { error } = await deleteReportedListing(report.id, report.reportedListingId);
    setActingReportId(null);
    if (error) {
      setActionError(error);
      addLog('Moderación: error al eliminar publicación reportada', { message: error });
      return;
    }
    addLog('Moderación: publicación reportada eliminada', { reportId: report.id, listingId: report.reportedListingId });
    setReports((prev) => prev.filter((r) => r.id !== report.id));
  };

  const openSuspendPrompt = (report: PendingReport) => {
    setSuspendPromptFor(report.id);
    setSuspendReasonInput('');
    setActionError(null);
  };

  const handleConfirmSuspend = async (report: PendingReport) => {
    const targetUserId = report.reportedUserId || report.listingOwnerId;
    if (!targetUserId) return;
    setActingReportId(report.id);
    setActionError(null);
    const { error } = await suspendReportedUser(report.id, targetUserId, suspendReasonInput.trim() || undefined);
    setActingReportId(null);
    if (error) {
      setActionError(error);
      addLog('Moderación: error al suspender usuario', { message: error });
      return;
    }
    addLog('Moderación: usuario suspendido', { reportId: report.id, userId: targetUserId });
    setSuspendPromptFor(null);
    setReports((prev) => prev.filter((r) => r.id !== report.id));
  };

  return (
    <div id="moderation-view" className="flex-1 w-full max-w-2xl mx-auto px-4 py-5 space-y-4">
      <header>
        <h1 className="font-display text-xl font-black text-ink-dark">Panel de moderación</h1>
        <p className="text-xs text-ink-soft mt-0.5">
          Reportes que mandaron otras personas, todavía sin revisar. Podés descartarlos, eliminar la publicación
          reportada o suspender la cuenta responsable.
        </p>
      </header>

      {actionError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          {actionError}
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && loadError && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 font-medium">
          No se pudieron cargar los reportes: {loadError}
        </div>
      )}

      {!loading && !loadError && reports.length === 0 && (
        <div className="flex flex-col items-center text-center py-10">
          <TruekMascot className="w-16 h-16 mb-2 animate-truek-float" />
          <p className="text-sm font-semibold text-ink">No hay reportes pendientes</p>
          <p className="text-xs text-ink-soft mt-1">Cuando alguien reporte una publicación o a otra persona, va a aparecer acá.</p>
        </div>
      )}

      {!loading && reports.length > 0 && (
        <div id="moderation-reports-list" className="space-y-3">
          {reports.map((report) => {
            const isActing = actingReportId === report.id;
            const targetUserId = report.reportedUserId || report.listingOwnerId;
            const targetUserName = report.reportedUserName || report.listingOwnerName;
            return (
              <div key={report.id} className="bg-white border border-border/60 rounded-xl p-4 shadow-sm space-y-2.5">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <span className="inline-block px-2 py-0.5 rounded-full bg-gold-light text-gold-dark text-[10px] font-black uppercase tracking-wide">
                      {REPORT_REASON_LABELS[report.reason] ?? report.reason}
                    </span>
                    <p className="text-[10px] text-ink-faint mt-1">
                      Reportado por <span className="font-semibold text-ink-soft">{report.reporterName}</span> ·{' '}
                      {new Date(report.createdAt).toLocaleString('es-AR')}
                    </p>
                  </div>
                </div>

                {report.reportedListingTitle && (
                  <p className="text-xs text-ink">
                    Publicación: <span className="font-bold">{report.reportedListingTitle}</span>
                    {report.listingOwnerName && (
                      <span className="text-ink-soft"> (de {report.listingOwnerName})</span>
                    )}
                  </p>
                )}
                {!report.reportedListingTitle && targetUserName && (
                  <p className="text-xs text-ink">
                    Persona reportada: <span className="font-bold">{targetUserName}</span>
                  </p>
                )}
                {report.comment && (
                  <p className="text-xs text-ink-soft bg-bg-soft rounded-lg p-2">"{report.comment}"</p>
                )}

                {suspendPromptFor === report.id ? (
                  <div className="pt-1 space-y-2 border-t border-border/40">
                    <label className="block text-[10px] font-semibold text-ink-soft">
                      Motivo de la suspensión (opcional, queda guardado)
                    </label>
                    <input
                      type="text"
                      value={suspendReasonInput}
                      onChange={(e) => setSuspendReasonInput(e.target.value)}
                      placeholder="Ej: publicó un artículo prohibido"
                      className="w-full px-3 py-1.5 text-xs bg-bg-soft border border-border rounded-lg focus:ring-2 focus:ring-red-400 focus:outline-none text-ink"
                    />
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => setSuspendPromptFor(null)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-white border border-border text-ink-soft text-[10px] font-black uppercase tracking-wide hover:bg-bg-soft disabled:opacity-60 transition-colors">
                        Cancelar
                      </button>
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => handleConfirmSuspend(report)}
                        className="flex-1 px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-40 transition-colors">
                        {isActing ? 'Suspendiendo...' : 'Confirmar suspensión'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 pt-1 border-t border-border/40">
                    <button
                      type="button"
                      disabled={isActing}
                      onClick={() => handleDismiss(report)}
                      className="px-3 py-1.5 rounded-lg bg-bg-soft hover:bg-border text-ink-soft text-[10px] font-black uppercase tracking-wide disabled:opacity-60 transition-colors">
                      Descartar
                    </button>
                    {report.reportedListingId && (
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => handleDeleteListing(report)}
                        className="px-3 py-1.5 rounded-lg bg-gold-light hover:bg-gold text-gold-dark text-[10px] font-black uppercase tracking-wide disabled:opacity-60 transition-colors">
                        Eliminar publicación
                      </button>
                    )}
                    {targetUserId && (
                      <button
                        type="button"
                        disabled={isActing}
                        onClick={() => openSuspendPrompt(report)}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white text-[10px] font-black uppercase tracking-wide disabled:opacity-60 transition-colors">
                        Suspender cuenta
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
