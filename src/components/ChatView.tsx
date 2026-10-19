/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import TruekMascot from './TruekMascot';
import { ChatMessage } from '../types';
import {
  fetchMessages,
  sendMessage,
  fetchMyConversations,
  ConversationSummary,
  formatTime,
  fetchUnreadConversationIds,
  markConversationRead,
} from '../lib/chat';
import {
  TradeOffer,
  fetchOffers,
  fetchMyAvailableListings,
  createCreditsOffer,
  createObjectOffer,
  acceptOffer,
  rejectOffer,
  cancelOffer,
  counterOffer,
  confirmDelivery,
  cancelConfirmedTrade,
  fetchMyPendingDeliveries,
  PendingDelivery,
} from '../lib/offers';
import { hasRatedOffer, submitTradeRating, fetchRatingSummary, RatingSummary } from '../lib/ratings';
import { submitReport, ReportReason, REPORT_REASON_LABELS } from '../lib/reports';
import { blockUser, unblockUser, amIBlocking, fetchMyBlockedPairIds, isBlockedPair } from '../lib/blocks';

export interface ActiveChatInfo {
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  listingImage: string;
  otherUserName: string;
  otherUserAvatar: string;
}

interface ChatViewProps {
  // Conversación a la que hay que saltar directo (p.ej. al tocar "Chatear"
  // en el Catálogo). Una vez que ChatView la toma, avisa con
  // onConsumeInitialChat para que el padre la limpie.
  initialChat: ActiveChatInfo | null;
  onConsumeInitialChat: () => void;
  currentUserId: string;
  // Créditos actuales del usuario (para validar antes de ofertar).
  currentUserCredits: number;
  // Se llama cuando un trueque se cierra de verdad (créditos movidos,
  // listings marcados como completados) para que la pantalla principal
  // actualice el saldo y el catálogo.
  onDealClosed: () => void;
  // Se llama cada vez que cambia el estado de "leído" de alguna
  // conversación (al abrir una), para que la pantalla principal pueda
  // refrescar el indicador global de no leídos en la navegación.
  onUnreadStatusChanged?: () => void;
  addLog: (title: string, data: any) => void;
}

function summaryToActiveChat(summary: ConversationSummary): ActiveChatInfo {
  return {
    conversationId: summary.conversationId,
    listingId: summary.listingId,
    buyerId: summary.buyerId,
    sellerId: summary.sellerId,
    listingTitle: summary.listingTitle,
    listingImage: summary.listingImage,
    otherUserName: summary.otherUserName,
    otherUserAvatar: summary.otherUserAvatar,
  };
}

const DEFAULT_PENDING_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30';
const DEFAULT_PENDING_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';

// null = esta publicación no tiene una conversación real asociada (no
// debería pasar nunca -- toda oferta se crea desde un chat ya abierto --
// pero por las dudas, no rompemos el saltito si faltara).
function pendingDeliveryToActiveChat(d: PendingDelivery): ActiveChatInfo | null {
  if (!d.conversationId) return null;
  return {
    conversationId: d.conversationId,
    listingId: d.listingId,
    buyerId: d.buyerId,
    sellerId: d.sellerId,
    listingTitle: d.listingTitle,
    listingImage: d.listingImage ?? DEFAULT_PENDING_IMAGE,
    otherUserName: d.counterpartName,
    otherUserAvatar: d.counterpartAvatar ?? DEFAULT_PENDING_AVATAR,
  };
}

const statusLabel: Record<TradeOffer['status'], string> = {
  pendiente: 'Pendiente',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada',
};

export default function ChatView({
  initialChat,
  onConsumeInitialChat,
  currentUserId,
  currentUserCredits,
  onDealClosed,
  onUnreadStatusChanged,
  addLog,
}: ChatViewProps) {
  // Qué conversación está abierta ahora mismo. null = estamos mostrando la bandeja.
  const [openChat, setOpenChat] = useState<ActiveChatInfo | null>(null);

  // --- Bandeja de conversaciones ---
  const [conversations, setConversations] = useState<ConversationSummary[]>([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState<string | null>(null);

  // Trueques ya aceptados (créditos/publicaciones reservados) a los que
  // les falta la confirmación de entrega de alguna de las dos partes --
  // los mostramos arriba de todo en la bandeja para no tener que andar
  // abriendo conversación por conversación para encontrarlos.
  const [pendingDeliveries, setPendingDeliveries] = useState<PendingDelivery[]>([]);
  const [pendingDeliveriesLoading, setPendingDeliveriesLoading] = useState(false);

  // Qué conversaciones (de las propias) tienen algo nuevo sin leer.
  const [unreadConversationIds, setUnreadConversationIds] = useState<Set<string>>(new Set());

  // Usuarios con los que tengo un bloqueo (en cualquier dirección) --
  // para esconder sus conversaciones/trueques en curso de la bandeja.
  const [blockedPairIds, setBlockedPairIds] = useState<Set<string>>(new Set());

  // --- Hilo de mensajes de la conversación abierta ---
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [inputText, setInputText] = useState('');
  const [sending, setSending] = useState(false);
  const chatScrollContainerRef = useRef<HTMLDivElement>(null);

  // --- Propuesta de intercambio real sobre esta publicación ---
  const [offers, setOffers] = useState<TradeOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offerActionError, setOfferActionError] = useState<string | null>(null);
  const [offerActionBusy, setOfferActionBusy] = useState(false);

  // Formulario para hacer una oferta nueva (solo lo usa el comprador)
  const [showOfferForm, setShowOfferForm] = useState(false);
  const [offerKind, setOfferKind] = useState<'creditos' | 'objeto'>('creditos');
  const [offerCredits, setOfferCredits] = useState('');
  const [offerListingId, setOfferListingId] = useState('');
  const [offerMessage, setOfferMessage] = useState('');
  const [myListings, setMyListings] = useState<{ id: string; title: string; image: string }[]>([]);
  const [myListingsLoading, setMyListingsLoading] = useState(false);
  const [submittingOffer, setSubmittingOffer] = useState(false);
  const [offerFormError, setOfferFormError] = useState<string | null>(null);

  // Formulario de contraoferta (lo puede usar comprador o vendedor, según
  // de quién sea el turno de responder).
  const [showCounterForm, setShowCounterForm] = useState(false);
  const [counterCredits, setCounterCredits] = useState('');
  const [counterMessage, setCounterMessage] = useState('');
  const [submittingCounter, setSubmittingCounter] = useState(false);
  const [counterFormError, setCounterFormError] = useState<string | null>(null);

  // --- Confirmación real de entrega de un trueque ya aceptado (para
  // liberar los créditos en espera y cerrarlo de verdad) ---
  const [confirmingDelivery, setConfirmingDelivery] = useState(false);
  const [confirmDeliveryError, setConfirmDeliveryError] = useState<string | null>(null);
  const [cancelingTrade, setCancelingTrade] = useState(false);

  // --- Calificación real del trueque cerrado (una vez que una oferta
  // queda 'aceptada') ---
  // null = todavía no sabemos (cargando o no aplica); true/false = ya
  // sabemos si esta persona calificó ESTA oferta puntual.
  const [hasRatedDeal, setHasRatedDeal] = useState<boolean | null>(null);
  const [showRatingForm, setShowRatingForm] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [ratingComment, setRatingComment] = useState('');
  const [submittingRating, setSubmittingRating] = useState(false);
  const [ratingError, setRatingError] = useState<string | null>(null);

  // Reputación real (promedio + cantidad) de la otra persona de este chat,
  // para mostrarla junto a su nombre y que sirva de referencia antes de
  // cerrar un trueque con ella.
  const [otherUserRating, setOtherUserRating] = useState<RatingSummary | null>(null);

  // --- Reportar o bloquear a la otra persona de esta conversación ---
  const [showBlockMenu, setShowBlockMenu] = useState(false);
  const [amIBlockingOther, setAmIBlockingOther] = useState(false);
  // Si hay un bloqueo en cualquier dirección con la otra persona de ESTE
  // chat puntual -- se comprueba directo contra la base al abrir el chat
  // (no depende de haber pasado antes por la bandeja).
  const [blockedWithOther, setBlockedWithOther] = useState(false);
  const [blockActionBusy, setBlockActionBusy] = useState(false);
  const [blockActionError, setBlockActionError] = useState<string | null>(null);

  const [showReportModal, setShowReportModal] = useState(false);
  const [reportReason, setReportReason] = useState<ReportReason>('spam');
  const [reportComment, setReportComment] = useState('');
  const [submittingReport, setSubmittingReport] = useState(false);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSubmitted, setReportSubmitted] = useState(false);

  // Si el padre nos pide saltar directo a una conversación (desde el Catálogo), la abrimos.
  useEffect(() => {
    if (initialChat) {
      setOpenChat(initialChat);
      onConsumeInitialChat();
    }
  }, [initialChat]);

  // Cuando volvemos a la bandeja (o entramos por primera vez), traemos la lista real.
  useEffect(() => {
    if (openChat || !currentUserId) return;

    setInboxLoading(true);
    setInboxError(null);
    fetchMyConversations(currentUserId).then(({ conversations: fetched, error }) => {
      setInboxLoading(false);
      if (error) {
        setInboxError('No se pudieron cargar tus conversaciones.');
        addLog('Negociación: error al cargar la bandeja real', { message: error });
        return;
      }
      setConversations(fetched);
      addLog('Negociación: bandeja real cargada', { total: fetched.length });
    });

    setPendingDeliveriesLoading(true);
    fetchMyPendingDeliveries().then(({ deliveries, error }) => {
      setPendingDeliveriesLoading(false);
      if (error) {
        addLog('Negociación: error al cargar los trueques en curso', { message: error });
        return;
      }
      setPendingDeliveries(deliveries);
    });

    fetchUnreadConversationIds().then(({ unreadIds, error }) => {
      if (error) {
        addLog('Negociación: error al calcular qué conversaciones tenés sin leer', { message: error });
        return;
      }
      setUnreadConversationIds(unreadIds);
    });

    fetchMyBlockedPairIds().then(({ ids, error }) => {
      if (error) {
        addLog('Negociación: error al cargar tus bloqueos', { message: error });
        return;
      }
      setBlockedPairIds(ids);
    });
  }, [openChat, currentUserId]);

  // Al abrir una conversación puntual, traemos sus mensajes reales.
  useEffect(() => {
    if (!openChat) {
      setMessages([]);
      return;
    }

    setLoading(true);
    setLoadError(null);
    fetchMessages(openChat.conversationId, currentUserId).then(({ messages: fetched, error }) => {
      setLoading(false);
      if (error) {
        setLoadError('No se pudieron cargar los mensajes.');
        addLog('Chat: error al cargar mensajes reales', { message: error });
        return;
      }
      setMessages(fetched);
      addLog('Chat: mensajes reales cargados', { conversationId: openChat.conversationId, total: fetched.length });
    });

    // La abrimos de verdad: queda marcada como leída (mensajes y
    // ofertas/contraofertas de la otra persona que hubiera pendientes).
    markConversationRead(openChat.conversationId).then(({ error }) => {
      if (error) {
        addLog('Chat: error al marcar la conversación como leída', { message: error });
        return;
      }
      setUnreadConversationIds((prev) => {
        if (!prev.has(openChat.conversationId)) return prev;
        const next = new Set(prev);
        next.delete(openChat.conversationId);
        return next;
      });
      onUnreadStatusChanged?.();
    });
  }, [openChat?.conversationId, currentUserId]);

  const refreshOffers = () => {
    if (!openChat) return;
    setOffersLoading(true);
    fetchOffers(openChat.listingId, openChat.buyerId).then(({ offers: fetched, error }) => {
      setOffersLoading(false);
      if (error) {
        addLog('Negociación: error al cargar las propuestas reales', { message: error });
        return;
      }
      setOffers(fetched);
    });
  };

  // Al abrir una conversación, traemos las propuestas reales hechas sobre ese listing.
  useEffect(() => {
    setShowOfferForm(false);
    setShowCounterForm(false);
    setOfferActionError(null);
    if (!openChat) {
      setOffers([]);
      return;
    }
    refreshOffers();
  }, [openChat?.conversationId]);

  // Reputación real de la otra persona de esta conversación (promedio +
  // cantidad de calificaciones recibidas), para mostrarla junto a su
  // nombre en el header del chat.
  useEffect(() => {
    if (!openChat) {
      setOtherUserRating(null);
      return;
    }
    const otherUserId = currentUserId === openChat.sellerId ? openChat.buyerId : openChat.sellerId;
    fetchRatingSummary(otherUserId).then(({ summary, error }) => {
      if (error) {
        addLog('Calificaciones: error al cargar la reputación real de la otra parte', { message: error });
        return;
      }
      setOtherUserRating(summary);
    });
  }, [openChat?.conversationId, currentUserId]);

  // Si YO bloqueé a la otra persona de esta conversación (para mostrar
  // "Desbloquear" en vez de "Bloquear" en el menú del chat).
  useEffect(() => {
    setShowBlockMenu(false);
    setBlockActionError(null);
    setShowReportModal(false);
    if (!openChat || !currentUserId) {
      setAmIBlockingOther(false);
      setBlockedWithOther(false);
      return;
    }
    const otherUserId = currentUserId === openChat.sellerId ? openChat.buyerId : openChat.sellerId;
    amIBlocking(currentUserId, otherUserId).then(({ blocking, error }) => {
      if (error) {
        addLog('Bloqueos: error al comprobar si bloqueaste a esta persona', { message: error });
        return;
      }
      setAmIBlockingOther(blocking);
    });
    isBlockedPair(currentUserId, otherUserId).then(({ blocked, error }) => {
      if (error) {
        addLog('Bloqueos: error al comprobar si hay un bloqueo con esta persona', { message: error });
        return;
      }
      setBlockedWithOther(blocked);
    });
  }, [openChat?.conversationId, currentUserId]);

  // Una vez que la última oferta de este chat quedó 'aceptada' (trueque
  // cerrado de verdad), nos fijamos si esta persona ya calificó ESE
  // trueque puntual, para mostrar el cartel de "Calificá a..." o no.
  useEffect(() => {
    setShowRatingForm(false);
    setRatingError(null);
    setRatingStars(5);
    setRatingComment('');
    setConfirmDeliveryError(null);

    const latest = offers[0] ?? null;
    if (!latest || !latest.deliveredAt || !currentUserId) {
      setHasRatedDeal(null);
      return;
    }

    setHasRatedDeal(null);
    hasRatedOffer(latest.id, currentUserId).then(({ rated, error }) => {
      if (error) {
        addLog('Calificaciones: error al comprobar si ya calificaste este trueque', { message: error });
        return;
      }
      setHasRatedDeal(rated);
    });
  }, [offers, currentUserId]);

  const handleSubmitRating = async (e: React.FormEvent) => {
    e.preventDefault();
    const latest = offers[0] ?? null;
    if (!latest || submittingRating) return;

    setSubmittingRating(true);
    setRatingError(null);
    const { error } = await submitTradeRating(latest.id, ratingStars, ratingComment);
    setSubmittingRating(false);

    if (error) {
      setRatingError('No se pudo guardar tu calificación. Probá de nuevo.');
      addLog('Calificaciones: error al guardar la calificación real', { message: error });
      return;
    }

    addLog('Calificaciones: calificación real guardada en Supabase', { offerId: latest.id, stars: ratingStars });
    setHasRatedDeal(true);
    setShowRatingForm(false);
    // Si por casualidad calificamos a quien es dueño de este chat (no
    // debería pasar, pero por si acaso), refrescamos su reputación mostrada.
    if (openChat) {
      const otherUserId = currentUserId === openChat.sellerId ? openChat.buyerId : openChat.sellerId;
      fetchRatingSummary(otherUserId).then(({ summary }) => setOtherUserRating(summary));
    }
  };

  // A quién corresponde reportar/bloquear desde este chat: la otra
  // persona de la conversación abierta.
  const otherUserIdForOpenChat = openChat
    ? currentUserId === openChat.sellerId
      ? openChat.buyerId
      : openChat.sellerId
    : null;
  const isBlockedWithOther = blockedWithOther;

  const handleToggleBlock = async () => {
    if (!openChat || !otherUserIdForOpenChat || blockActionBusy) return;
    setBlockActionBusy(true);
    setBlockActionError(null);

    if (amIBlockingOther) {
      const { error } = await unblockUser(currentUserId, otherUserIdForOpenChat);
      setBlockActionBusy(false);
      if (error) {
        setBlockActionError('No se pudo desbloquear. Probá de nuevo.');
        addLog('Bloqueos: error al desbloquear desde el chat', { message: error });
        return;
      }
      setAmIBlockingOther(false);
      setBlockedWithOther(false);
      setBlockedPairIds((prev) => {
        const next = new Set(prev);
        next.delete(otherUserIdForOpenChat);
        return next;
      });
      addLog('Bloqueos: usuario desbloqueado desde el chat', { otherUserId: otherUserIdForOpenChat });
    } else {
      const { error } = await blockUser(currentUserId, otherUserIdForOpenChat);
      setBlockActionBusy(false);
      if (error) {
        setBlockActionError('No se pudo bloquear. Probá de nuevo.');
        addLog('Bloqueos: error al bloquear desde el chat', { message: error });
        return;
      }
      setAmIBlockingOther(true);
      setBlockedWithOther(true);
      setBlockedPairIds((prev) => new Set(prev).add(otherUserIdForOpenChat));
      addLog('Bloqueos: usuario bloqueado desde el chat', { otherUserId: otherUserIdForOpenChat });
    }
    setShowBlockMenu(false);
  };

  const openReportModalFromChat = () => {
    setShowBlockMenu(false);
    setReportReason('spam');
    setReportComment('');
    setReportError(null);
    setReportSubmitted(false);
    setShowReportModal(true);
  };

  const handleSubmitReportFromChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otherUserIdForOpenChat || submittingReport) return;

    setSubmittingReport(true);
    setReportError(null);
    const { error } = await submitReport({
      reporterId: currentUserId,
      reportedUserId: otherUserIdForOpenChat,
      reason: reportReason,
      comment: reportComment,
    });
    setSubmittingReport(false);

    if (error) {
      setReportError('No se pudo enviar el reporte. Probá de nuevo.');
      addLog('Reportes: error al reportar usuario desde el chat', { message: error });
      return;
    }

    addLog('Reportes: usuario reportado desde el chat', { reportedUserId: otherUserIdForOpenChat, reason: reportReason });
    setReportSubmitted(true);
  };

  useEffect(() => {
    // Scroll chat content to bottom when new messages arrive
    if (chatScrollContainerRef.current) {
      chatScrollContainerRef.current.scrollTop = chatScrollContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || !openChat || sending) return;

    const text = inputText;
    setSending(true);
    const { message, error } = await sendMessage(openChat.conversationId, currentUserId, text);
    setSending(false);

    if (error || !message) {
      setLoadError('No se pudo enviar el mensaje. Probá de nuevo.');
      addLog('Chat: error al enviar mensaje real', { message: error });
      return;
    }

    setMessages(prev => [...prev, message]);
    setInputText('');
    addLog('Chat: mensaje real guardado en Supabase', { conversationId: openChat.conversationId });
  };

  const openOfferForm = () => {
    setShowOfferForm(true);
    setOfferFormError(null);
    setOfferKind('creditos');
    setOfferCredits('');
    setOfferListingId('');
    setOfferMessage('');

    if (openChat) {
      setMyListingsLoading(true);
      fetchMyAvailableListings(currentUserId, openChat.listingId).then(({ listings, error }) => {
        setMyListingsLoading(false);
        if (!error) setMyListings(listings);
      });
    }
  };

  const handleSubmitOffer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!openChat || submittingOffer) return;

    setOfferFormError(null);

    if (offerKind === 'creditos') {
      const credits = parseInt(offerCredits, 10);
      if (!credits || credits <= 0) {
        setOfferFormError('Ingresá una cantidad de créditos válida.');
        return;
      }
      if (credits > currentUserCredits) {
        setOfferFormError(`No tenés suficientes créditos (tenés ${currentUserCredits}).`);
        return;
      }

      setSubmittingOffer(true);
      const { error } = await createCreditsOffer(openChat.listingId, currentUserId, credits, offerMessage);
      setSubmittingOffer(false);

      if (error) {
        setOfferFormError('No se pudo enviar la oferta. Probá de nuevo.');
        addLog('Negociación: error al crear oferta de créditos', { message: error });
        return;
      }
    } else {
      if (!offerListingId) {
        setOfferFormError('Elegí qué publicación tuya vas a ofrecer.');
        return;
      }

      setSubmittingOffer(true);
      const { error } = await createObjectOffer(openChat.listingId, currentUserId, offerListingId, offerMessage);
      setSubmittingOffer(false);

      if (error) {
        setOfferFormError('No se pudo enviar la oferta. Probá de nuevo.');
        addLog('Negociación: error al crear oferta de objeto', { message: error });
        return;
      }
    }

    addLog('Negociación: oferta real enviada', { listingId: openChat.listingId, offerKind });
    setShowOfferForm(false);
    refreshOffers();
  };

  const handleAccept = async (offerId: string) => {
    setOfferActionBusy(true);
    setOfferActionError(null);
    const { error } = await acceptOffer(offerId);
    setOfferActionBusy(false);

    if (error) {
      setOfferActionError(error);
      addLog('Negociación: error al aceptar la oferta', { message: error });
      return;
    }

    addLog('Negociación: oferta aceptada. Créditos en espera y publicación reservada hasta confirmar la entrega.', { offerId });
    refreshOffers();
    onDealClosed();
  };

  // Cada parte toca esto cuando ya recibió lo suyo de verdad. Solo cuando
  // las DOS lo hicieron el trueque se cierra: se liberan los créditos en
  // espera y las publicaciones pasan a 'completado'.
  const handleConfirmDelivery = async (offerId: string) => {
    setConfirmingDelivery(true);
    setConfirmDeliveryError(null);
    const { bothConfirmed, error } = await confirmDelivery(offerId);
    setConfirmingDelivery(false);

    if (error) {
      setConfirmDeliveryError(error);
      addLog('Negociación: error al confirmar la entrega real', { message: error });
      return;
    }

    addLog(
      bothConfirmed
        ? 'Negociación: ambas partes confirmaron. Trueque cerrado de verdad, créditos transferidos.'
        : 'Negociación: confirmaste tu parte. Esperando que la otra persona confirme la suya.',
      { offerId, bothConfirmed }
    );
    refreshOffers();
    if (bothConfirmed) onDealClosed();
  };

  // Vía de salida si la coordinación por chat no llegó a nada: devuelve
  // los créditos en espera y las publicaciones vuelven a estar
  // disponibles.
  const handleCancelConfirmedTrade = async (offerId: string) => {
    setCancelingTrade(true);
    setConfirmDeliveryError(null);
    const { error } = await cancelConfirmedTrade(offerId);
    setCancelingTrade(false);

    if (error) {
      setConfirmDeliveryError(error);
      addLog('Negociación: error al cancelar el trueque aceptado', { message: error });
      return;
    }

    addLog('Negociación: trueque aceptado cancelado. Créditos liberados y publicación disponible otra vez.', { offerId });
    refreshOffers();
    onDealClosed();
  };

  const handleReject = async (offerId: string) => {
    setOfferActionBusy(true);
    setOfferActionError(null);
    const { error } = await rejectOffer(offerId);
    setOfferActionBusy(false);

    if (error) {
      setOfferActionError(error);
      addLog('Negociación: error al rechazar la oferta', { message: error });
      return;
    }

    addLog('Negociación: oferta rechazada', { offerId });
    refreshOffers();
  };

  const handleCancel = async (offerId: string) => {
    setOfferActionBusy(true);
    setOfferActionError(null);
    const { error } = await cancelOffer(offerId);
    setOfferActionBusy(false);

    if (error) {
      setOfferActionError(error);
      addLog('Negociación: error al cancelar la oferta', { message: error });
      return;
    }

    addLog('Negociación: oferta cancelada', { offerId });
    refreshOffers();
  };

  const openCounterForm = (currentOffer: TradeOffer) => {
    setShowCounterForm(true);
    setCounterFormError(null);
    setCounterMessage('');
    // Arrancamos con el monto actual como referencia, listo para ajustar.
    setCounterCredits(currentOffer.offeredCredits != null ? String(currentOffer.offeredCredits) : '');
  };

  const handleSubmitCounter = async (e: React.FormEvent, currentOffer: TradeOffer) => {
    e.preventDefault();
    if (submittingCounter) return;

    setCounterFormError(null);

    const credits = parseInt(counterCredits, 10);
    if (!credits || credits <= 0) {
      setCounterFormError('Ingresá una cantidad de créditos válida.');
      return;
    }
    if (currentUserId === currentOffer.fromUserId && credits > currentUserCredits) {
      setCounterFormError(`No tenés suficientes créditos (tenés ${currentUserCredits}).`);
      return;
    }

    setSubmittingCounter(true);
    const { error } = await counterOffer(currentOffer.id, credits, counterMessage);
    setSubmittingCounter(false);

    if (error) {
      setCounterFormError('No se pudo enviar la contraoferta. Probá de nuevo.');
      addLog('Negociación: error al enviar contraoferta', { message: error });
      return;
    }

    addLog('Negociación: contraoferta real enviada', { offerId: currentOffer.id, credits });
    setShowCounterForm(false);
    setCounterCredits('');
    setCounterMessage('');
    refreshOffers();
  };

  // --- Vista: bandeja de conversaciones ---
  if (!openChat) {
    return (
      <div className="relative flex flex-col flex-1 w-full bg-canvas md:rounded-2xl md:border md:border-border md:shadow-sm text-ink">
        <section className="bg-white border-b border-border p-3">
          <h3 className="text-xs font-black text-primary-dark uppercase tracking-widest">Mis conversaciones</h3>
        </section>

        {!pendingDeliveriesLoading && pendingDeliveries.length > 0 && (
          <section id="pending-deliveries-section" className="bg-plum-light border-b border-plum/30 p-3 space-y-2">
            <h3 className="text-[10px] font-black text-primary uppercase tracking-widest flex items-center gap-1">
              <span className="material-symbols-rounded text-[13px]">pending_actions</span>
              Trueques en curso ({pendingDeliveries.length})
            </h3>

            {pendingDeliveries
              .filter((d) => !blockedPairIds.has(d.counterpartId))
              .map((d) => {
              const activeChat = pendingDeliveryToActiveChat(d);
              const isMyTurn = !d.iConfirmed;
              return (
                <button
                  key={d.offerId}
                  type="button"
                  disabled={!activeChat}
                  onClick={() => activeChat && setOpenChat(activeChat)}
                  className="w-full flex items-center gap-2.5 bg-white rounded-xl p-2.5 border border-gold-border hover:border-gold-dark hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-bounce text-left disabled:opacity-60 disabled:cursor-not-allowed">
                  <img
                    alt={d.listingTitle}
                    src={d.listingImage ?? DEFAULT_PENDING_IMAGE}
                    className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <h4 className="text-xs font-black text-ink truncate">{d.listingTitle}</h4>
                    <p className="text-[10px] text-ink-soft truncate">Con {d.counterpartName}</p>
                    <p className={`text-[10px] font-bold mt-0.5 flex items-center gap-1 ${isMyTurn ? 'text-gold-dark' : 'text-ink-soft'}`}>
                      <span className="material-symbols-rounded text-[11px]">
                        {isMyTurn ? 'touch_app' : 'hourglass_empty'}
                      </span>
                      {isMyTurn ? 'Tu turno: confirmá cuando lo recibas' : `Esperando que ${d.counterpartName} confirme`}
                    </p>
                  </div>
                </button>
              );
            })}
          </section>
        )}

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {inboxLoading && (
            <div className="flex justify-center py-8">
              <div className="w-6 h-6 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {inboxError && (
            <p className="text-[11px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              {inboxError}
            </p>
          )}

          {!inboxLoading && !inboxError && conversations.length === 0 && (
            <div className="text-center py-10 px-4">
              <TruekMascot className="w-16 h-16 mx-auto mb-2 animate-truek-float" />
              <p className="text-xs font-bold text-ink-soft">Todavía no tenés conversaciones</p>
              <p className="text-[10px] text-ink-soft mt-1">
                Andá al Catálogo y tocá "Chatear" o "Pedir" en alguna publicación para empezar una.
              </p>
            </div>
          )}

          {conversations
            .filter((c) => {
              const otherId = c.buyerId === currentUserId ? c.sellerId : c.buyerId;
              return !blockedPairIds.has(otherId);
            })
            .map((c) => {
            const isUnread = unreadConversationIds.has(c.conversationId);
            return (
            <button
              key={c.conversationId}
              type="button"
              onClick={() => setOpenChat(summaryToActiveChat(c))}
              className={`w-full flex items-center gap-2.5 bg-white rounded-xl p-2.5 border hover:shadow-sm hover:-translate-y-0.5 transition-all duration-200 ease-bounce text-left ${
                isUnread ? 'border-primary/50' : 'border-border hover:border-primary/40'
              }`}>
              <div className="relative shrink-0">
                <img
                  alt={c.otherUserName}
                  src={c.otherUserAvatar}
                  className="w-10 h-10 rounded-full object-cover border border-border"
                />
                {isUnread && (
                  <span
                    id={`unread-dot-${c.conversationId}`}
                    className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-primary rounded-full border-2 border-white animate-pulse"
                  />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex justify-between items-baseline gap-2">
                  <h4 className={`text-xs truncate ${isUnread ? 'font-black text-ink' : 'font-bold text-ink-soft'}`}>
                    {c.otherUserName}
                  </h4>
                  {c.lastMessageAt && (
                    <span className="text-[9px] text-ink-faint shrink-0">{formatTime(c.lastMessageAt)}</span>
                  )}
                </div>
                <p className="text-[10px] text-ink-soft truncate">{c.listingTitle}</p>
                <p className={`text-[10px] truncate mt-0.5 ${isUnread ? 'text-ink font-semibold' : 'text-ink-soft'}`}>
                  {c.lastMessage ?? 'Sin mensajes todavía'}
                </p>
              </div>
            </button>
            );
          })}
        </div>
      </div>
    );
  }

  const isSeller = currentUserId === openChat.sellerId;
  const latestOffer = offers[0] ?? null;

  return (
    <div className="relative flex flex-col flex-1 w-full bg-canvas md:rounded-2xl md:border md:border-border md:shadow-sm overflow-hidden text-ink">

      {/* Header real: volver a la bandeja + sobre qué publicación y con quién es esta conversación */}
      <section className="relative bg-white border-b border-border p-3 flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => setOpenChat(null)}
          className="w-7 h-7 rounded-full hover:bg-bg-soft hover:-translate-x-0.5 active:scale-90 flex items-center justify-center shrink-0 transition-all duration-200 ease-bounce">
          <span className="material-symbols-rounded text-[18px] text-ink-soft">arrow_back</span>
        </button>
        <img
          alt={openChat.listingTitle}
          src={openChat.listingImage}
          className="w-10 h-10 rounded-lg object-cover border border-border shrink-0"
        />
        <div className="min-w-0 flex-1">
          <h4 className="text-xs font-black text-ink truncate">{openChat.listingTitle}</h4>
          <p className="text-[10px] text-ink-soft truncate flex items-center gap-1">
            <span>Conversación con {openChat.otherUserName}</span>
            {otherUserRating && otherUserRating.average != null && (
              <span id="chat-other-user-rating" className="shrink-0 inline-flex items-center gap-0.5 text-gold-dark font-bold">
                <span className="material-symbols-rounded text-[11px]">star</span>
                {otherUserRating.average.toFixed(1)}
                <span className="text-ink-faint font-normal">({otherUserRating.total})</span>
              </span>
            )}
          </p>
        </div>
        <img
          alt={openChat.otherUserName}
          src={openChat.otherUserAvatar}
          className="w-8 h-8 rounded-full object-cover border border-border shrink-0"
        />

        <div className="relative shrink-0">
          <button
            id="chat-more-menu-btn"
            type="button"
            onClick={() => setShowBlockMenu((v) => !v)}
            className="w-7 h-7 rounded-full hover:bg-bg-soft hover:rotate-90 active:scale-90 flex items-center justify-center transition-all duration-200 ease-bounce">
            <span className="material-symbols-rounded text-[18px] text-ink-soft">more_vert</span>
          </button>

          {showBlockMenu && (
            <div className="absolute right-0 top-8 z-10 w-44 bg-white border border-border rounded-xl shadow-lg overflow-hidden text-left">
              <button
                id="report-user-from-chat-btn"
                type="button"
                onClick={openReportModalFromChat}
                className="w-full px-3 py-2 text-[11px] font-semibold text-ink-soft hover:bg-bg-soft flex items-center gap-1.5">
                <span className="material-symbols-rounded text-[14px]">flag</span>
                Reportar a {openChat.otherUserName}
              </button>
              <button
                id="block-user-from-chat-btn"
                type="button"
                disabled={blockActionBusy}
                onClick={handleToggleBlock}
                className="w-full px-3 py-2 text-[11px] font-semibold text-red-600 hover:bg-red-50 flex items-center gap-1.5 border-t border-border disabled:opacity-60">
                <span className="material-symbols-rounded text-[14px]">block</span>
                {blockActionBusy ? 'Un momento...' : amIBlockingOther ? `Desbloquear a ${openChat.otherUserName}` : `Bloquear a ${openChat.otherUserName}`}
              </button>
            </div>
          )}
        </div>
      </section>

      {blockActionError && (
        <p className="px-3 py-1.5 text-[10px] font-semibold text-red-600 bg-red-50 border-b border-red-200">
          {blockActionError}
        </p>
      )}

      {isBlockedWithOther && (
        <section id="chat-blocked-banner" className="bg-bg-soft border-b border-border px-3 py-2.5 text-[10px] text-ink-soft flex items-center gap-1.5">
          <span className="material-symbols-rounded text-[14px] text-ink-soft">block</span>
          {amIBlockingOther
            ? `Bloqueaste a ${openChat.otherUserName}. No pueden escribirse ni hacerse ofertas nuevas mientras siga así.`
            : `Ya no podés escribirle ni hacerle ofertas a ${openChat.otherUserName}.`}
        </section>
      )}

      {/* Panel real de negociación: ofertas con créditos o con un artículo propio */}
      {!isBlockedWithOther && (
      <section className="bg-white border-b border-border p-3 text-xs">
        {offersLoading ? (
          <div className="flex justify-center py-2">
            <div className="w-5 h-5 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <>
            {offerActionError && (
              <p className="mb-2 text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                {offerActionError}
              </p>
            )}

            {latestOffer && (
              <div className="mb-2 bg-bg-soft border border-border rounded-lg p-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-[10px] font-black text-ink">
                    {(() => {
                      // Si la última movida la hizo el vendedor, es una
                      // contraoferta sobre lo que propuso el comprador.
                      const label = latestOffer.lastActorId === latestOffer.fromUserId ? 'Oferta' : 'Contraoferta';
                      return latestOffer.offerType === 'creditos'
                        ? `${label}: ${latestOffer.offeredCredits} créditos`
                        : `${label}: su publicación "${latestOffer.offeredListingTitle}"`;
                    })()}
                  </span>
                  <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-full shrink-0 ${
                    latestOffer.status === 'pendiente' ? 'bg-gold-light text-primary' :
                    latestOffer.status === 'aceptada' ? 'bg-emerald-100 text-emerald-700' :
                    'bg-border text-ink-soft'
                  }`}>
                    {latestOffer.status === 'aceptada' && !latestOffer.deliveredAt
                      ? 'Coordinando entrega'
                      : statusLabel[latestOffer.status]}
                  </span>
                </div>
                {latestOffer.message && (
                  <p className="text-[10px] text-ink-soft mt-1 italic">"{latestOffer.message}"</p>
                )}

                {latestOffer.status === 'pendiente' && (() => {
                  const isMyTurnToRespond = latestOffer.lastActorId !== currentUserId;
                  return (
                    <div className="mt-2 space-y-1.5">
                      {isMyTurnToRespond ? (
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            disabled={offerActionBusy}
                            onClick={() => handleAccept(latestOffer.id)}
                            className="flex-1 bg-primary hover:bg-primary hover:-translate-y-0.5 text-white rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all duration-200 ease-bounce disabled:opacity-60">
                            Aceptar
                          </button>
                          <button
                            type="button"
                            disabled={offerActionBusy}
                            onClick={() => openCounterForm(latestOffer)}
                            className="flex-1 bg-plum-light hover:bg-plum-light hover:-translate-y-0.5 text-plum rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all duration-200 ease-bounce disabled:opacity-60">
                            Contraofertar
                          </button>
                        </div>
                      ) : (
                        <p className="text-[10px] text-ink-soft italic flex items-center gap-1">
                          <span className="material-symbols-rounded text-[12px]">hourglass_empty</span>
                          Esperando respuesta de {openChat.otherUserName}...
                        </p>
                      )}

                      {showCounterForm && isMyTurnToRespond && (
                        <form
                          onSubmit={(e) => handleSubmitCounter(e, latestOffer)}
                          className="space-y-2 border border-plum/20 rounded-lg p-2.5 bg-plum-light/15">
                          <div>
                            <input
                              id="counter-offer-credits-input"
                              type="number"
                              min={1}
                              value={counterCredits}
                              onChange={(e) => setCounterCredits(e.target.value)}
                              placeholder="Nueva cantidad de créditos"
                              className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-plum focus:outline-none"
                            />
                            {currentUserId === latestOffer.fromUserId && (
                              <p className="text-[9px] text-ink-soft mt-0.5">Tenés {currentUserCredits} créditos disponibles.</p>
                            )}
                          </div>
                          <input
                            type="text"
                            value={counterMessage}
                            onChange={(e) => setCounterMessage(e.target.value)}
                            placeholder="Mensaje opcional..."
                            className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-plum focus:outline-none"
                          />
                          {counterFormError && (
                            <p className="text-[10px] font-semibold text-red-600">{counterFormError}</p>
                          )}
                          <div className="flex gap-1.5">
                            <button
                              type="button"
                              onClick={() => setShowCounterForm(false)}
                              className="flex-1 bg-white border border-border text-ink-soft rounded-md py-1.5 text-[10px] font-bold">
                              Cancelar
                            </button>
                            <button
                              id="counter-offer-submit-btn"
                              type="submit"
                              disabled={submittingCounter}
                              className="flex-[2] bg-plum hover:bg-plum text-white rounded-md py-1.5 text-[10px] font-black uppercase disabled:opacity-60">
                              {submittingCounter ? 'Enviando...' : 'Enviar contraoferta'}
                            </button>
                          </div>
                        </form>
                      )}

                      <button
                        type="button"
                        disabled={offerActionBusy}
                        onClick={() => (isSeller ? handleReject(latestOffer.id) : handleCancel(latestOffer.id))}
                        className="w-full bg-bg-soft hover:bg-border text-ink-soft rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all disabled:opacity-60">
                        {isSeller ? 'Rechazar y terminar negociación' : 'Cancelar oferta'}
                      </button>
                    </div>
                  );
                })()}

                {latestOffer.status === 'aceptada' && !latestOffer.deliveredAt && (() => {
                  const amIBuyer = currentUserId === latestOffer.fromUserId;
                  const iConfirmed = amIBuyer ? latestOffer.buyerConfirmedAt : latestOffer.sellerConfirmedAt;
                  const otherConfirmed = amIBuyer ? latestOffer.sellerConfirmedAt : latestOffer.buyerConfirmedAt;
                  return (
                    <div className="mt-1.5 space-y-1.5">
                      <p className="text-[10px] text-primary font-semibold flex items-center gap-1">
                        <span className="material-symbols-rounded text-[12px]">handshake</span>
                        Trato aceptado. Coordiná la entrega por chat y confirmá cuando la tengas.
                      </p>

                      {confirmDeliveryError && (
                        <p className="text-[10px] font-semibold text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
                          {confirmDeliveryError}
                        </p>
                      )}

                      {iConfirmed ? (
                        <p className="text-[10px] text-ink-soft italic flex items-center gap-1">
                          <span className="material-symbols-rounded text-[12px]">hourglass_empty</span>
                          Ya confirmaste tu parte. Esperando que {openChat.otherUserName} confirme la suya...
                        </p>
                      ) : (
                        <button
                          id="confirm-delivery-btn"
                          type="button"
                          disabled={confirmingDelivery}
                          onClick={() => handleConfirmDelivery(latestOffer.id)}
                          className="w-full bg-primary hover:bg-primary text-white rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-1.5">
                          <span className="material-symbols-rounded text-[14px]">check_circle</span>
                          {confirmingDelivery ? 'Confirmando...' : 'Confirmar que ya se entregó'}
                        </button>
                      )}

                      {otherConfirmed && !iConfirmed && (
                        <p className="text-[9px] text-emerald-600 font-semibold">
                          {openChat.otherUserName} ya confirmó su parte.
                        </p>
                      )}

                      <button
                        id="cancel-confirmed-trade-btn"
                        type="button"
                        disabled={cancelingTrade}
                        onClick={() => handleCancelConfirmedTrade(latestOffer.id)}
                        className="w-full bg-bg-soft hover:bg-border text-ink-soft rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all disabled:opacity-60">
                        {cancelingTrade ? 'Cancelando...' : 'La entrega no se concretó: cancelar trueque'}
                      </button>
                    </div>
                  );
                })()}

                {latestOffer.status === 'aceptada' && latestOffer.deliveredAt && (
                  <div className="mt-1.5">
                    <p className="text-[10px] text-emerald-700 font-semibold flex items-center gap-1">
                      <span className="material-symbols-rounded text-[12px]">check_circle</span>
                      Intercambio completado.
                    </p>

                    {hasRatedDeal === true && (
                      <p className="text-[10px] text-ink-soft mt-1 flex items-center gap-1">
                        <span className="material-symbols-rounded text-[12px] text-gold-dark">star</span>
                        Ya calificaste este trueque. ¡Gracias!
                      </p>
                    )}

                    {hasRatedDeal === false && !showRatingForm && (
                      <button
                        id="open-rating-form-btn"
                        type="button"
                        onClick={() => setShowRatingForm(true)}
                        className="mt-1.5 w-full bg-gold-light hover:brightness-95 hover:-translate-y-0.5 border border-gold-border text-primary rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all duration-200 ease-bounce flex items-center justify-center gap-1.5">
                        <span className="material-symbols-rounded text-[14px]">star</span>
                        Calificar a {openChat.otherUserName}
                      </button>
                    )}

                    {hasRatedDeal === false && showRatingForm && (
                      <form onSubmit={handleSubmitRating} className="mt-1.5 space-y-2 border border-gold-border rounded-lg p-2.5 bg-gold-light">
                        <p className="text-[10px] font-black text-primary">¿Cómo te fue con {openChat.otherUserName}?</p>
                        <div id="rating-stars-input" className="flex gap-1 justify-center py-1">
                          {[1, 2, 3, 4, 5].map((n) => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setRatingStars(n)}
                              className="active:scale-90 hover:scale-125 transition-transform duration-200 ease-bounce"
                              aria-label={`${n} estrellas`}>
                              <span
                                className={`material-symbols-rounded text-[22px] ${
                                  n <= ratingStars ? 'text-primary' : 'text-ink-faint'
                                }`}
                                style={{ fontVariationSettings: n <= ratingStars ? "'FILL' 1" : "'FILL' 0" }}>
                                star
                              </span>
                            </button>
                          ))}
                        </div>
                        <input
                          id="rating-comment-input"
                          type="text"
                          value={ratingComment}
                          onChange={(e) => setRatingComment(e.target.value)}
                          placeholder="Comentario opcional..."
                          maxLength={300}
                          className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-gold-border rounded-md focus:ring-1 focus:ring-gold-dark focus:outline-none"
                        />
                        {ratingError && <p className="text-[10px] font-semibold text-red-600">{ratingError}</p>}
                        <div className="flex gap-1.5">
                          <button
                            type="button"
                            onClick={() => setShowRatingForm(false)}
                            className="flex-1 bg-white border border-border text-ink-soft rounded-md py-1.5 text-[10px] font-bold">
                            Ahora no
                          </button>
                          <button
                            id="submit-rating-btn"
                            type="submit"
                            disabled={submittingRating}
                            className="flex-[2] bg-gold-dark hover:opacity-90 text-white rounded-md py-1.5 text-[10px] font-black uppercase disabled:opacity-60">
                            {submittingRating ? 'Guardando...' : 'Enviar calificación'}
                          </button>
                        </div>
                      </form>
                    )}
                  </div>
                )}
              </div>
            )}

            {!isSeller && (!latestOffer || latestOffer.status === 'rechazada' || latestOffer.status === 'cancelada') && (
              !showOfferForm ? (
                <button
                  type="button"
                  onClick={openOfferForm}
                  className="w-full bg-primary hover:bg-primary hover:-translate-y-0.5 text-white rounded-lg py-2 text-[10px] font-black uppercase tracking-wide active:scale-95 transition-all duration-200 ease-bounce flex items-center justify-center gap-1.5">
                  <span className="material-symbols-rounded text-[14px]">handshake</span>
                  Hacer una oferta
                </button>
              ) : (
                <form onSubmit={handleSubmitOffer} className="space-y-2 border border-border rounded-lg p-2.5 bg-bg-soft">
                  <div className="flex gap-1">
                    <button
                      type="button"
                      onClick={() => setOfferKind('creditos')}
                      className={`flex-1 py-1 rounded-md text-[9px] font-black uppercase transition-all duration-200 ease-bounce active:scale-95 ${
                        offerKind === 'creditos' ? 'bg-primary text-white' : 'bg-white text-ink-soft border border-border'
                      }`}>
                      Con créditos
                    </button>
                    <button
                      type="button"
                      onClick={() => setOfferKind('objeto')}
                      className={`flex-1 py-1 rounded-md text-[9px] font-black uppercase transition-all duration-200 ease-bounce active:scale-95 ${
                        offerKind === 'objeto' ? 'bg-primary text-white' : 'bg-white text-ink-soft border border-border'
                      }`}>
                      Con un artículo mío
                    </button>
                  </div>

                  {offerKind === 'creditos' ? (
                    <div>
                      <input
                        type="number"
                        min={1}
                        max={currentUserCredits}
                        value={offerCredits}
                        onChange={(e) => setOfferCredits(e.target.value)}
                        placeholder="Cantidad de créditos"
                        className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
                      />
                      <p className="text-[9px] text-ink-soft mt-0.5">Tenés {currentUserCredits} créditos disponibles.</p>
                    </div>
                  ) : myListingsLoading ? (
                    <p className="text-[10px] text-ink-soft">Cargando tus publicaciones...</p>
                  ) : myListings.length === 0 ? (
                    <p className="text-[10px] text-ink-soft">
                      No tenés otras publicaciones disponibles para ofrecer. Primero publicá algo en el Catálogo.
                    </p>
                  ) : (
                    <select
                      value={offerListingId}
                      onChange={(e) => setOfferListingId(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none">
                      <option value="">Elegí una publicación tuya...</option>
                      {myListings.map((l) => (
                        <option key={l.id} value={l.id}>{l.title}</option>
                      ))}
                    </select>
                  )}

                  <input
                    type="text"
                    value={offerMessage}
                    onChange={(e) => setOfferMessage(e.target.value)}
                    placeholder="Mensaje opcional..."
                    className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none"
                  />

                  {offerFormError && (
                    <p className="text-[10px] font-semibold text-red-600">{offerFormError}</p>
                  )}

                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setShowOfferForm(false)}
                      className="flex-1 bg-white border border-border text-ink-soft rounded-md py-1.5 text-[10px] font-bold">
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={submittingOffer || (offerKind === 'objeto' && myListings.length === 0)}
                      className="flex-[2] bg-primary hover:bg-primary text-white rounded-md py-1.5 text-[10px] font-black uppercase disabled:opacity-60">
                      {submittingOffer ? 'Enviando...' : 'Enviar oferta'}
                    </button>
                  </div>
                </form>
              )
            )}

            {isSeller && !latestOffer && (
              <p className="text-[10px] text-ink-soft">Todavía no recibiste ninguna oferta por esta publicación.</p>
            )}
          </>
        )}
      </section>
      )}

      {/* Main Messaging timeline body */}
      <div
        id="chat-messages-container"
        ref={chatScrollContainerRef}
        className="flex-1 overflow-y-auto space-y-3 p-3 scroll-smooth bg-bg-soft bg-[radial-gradient(#e6dcc8_0.5px,transparent_0.5px)] [background-size:12px_12px]">

        {loading && (
          <div className="flex justify-center py-6">
            <div className="w-6 h-6 border-[3px] border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!loading && messages.length === 0 && !loadError && (
          <div className="flex flex-col items-center my-2">
            <TruekMascot className="w-12 h-12 mb-1 animate-truek-float" />
            <div className="bg-white text-ink-soft px-3 py-2 rounded-xl text-[10px] text-center border border-border max-w-[220px]">
              Todavía no hay mensajes. ¡Escribí el primero!
            </div>
          </div>
        )}

        {messages.map((msg) => {
          if (msg.sender === 'system') {
            return (
              <div key={msg.id} className="flex justify-center my-2">
                <div id="chat-system-milestone" className="bg-plum-light text-plum px-3 py-1 rounded-full text-[9px] font-bold flex items-center gap-1 border border-plum/10">
                  <span className="material-symbols-rounded text-[12px] block">{msg.systemIcon || 'info'}</span>
                  <span>{msg.text}</span>
                </div>
              </div>
            );
          }

          const isSelf = msg.sender === 'self';
          return (
            <div key={msg.id} className={`flex gap-2 max-w-[85%] ${isSelf ? 'ml-auto flex-row-reverse' : ''}`}>
              {!isSelf && (
                <div className="w-8 h-8 rounded-full overflow-hidden border border-border/50 shrink-0">
                  <img alt={openChat.otherUserName} className="w-full h-full object-cover" src={openChat.otherUserAvatar} />
                </div>
              )}

              <div className="space-y-0.5">
                <div id="chat-bubble-text" className={`p-2 px-3 text-xs rounded-xl shadow-sm ${
                  isSelf
                    ? 'bg-primary text-white rounded-tr-none'
                    : 'bg-white text-ink rounded-tl-none border border-border/60'
                }`}>
                  {msg.text}
                </div>
                <div className={`text-[8px] text-ink-faint px-1 ${isSelf ? 'text-right' : ''}`}>{msg.time}</div>
              </div>
            </div>
          );
        })}
      </div>

      {loadError && (
        <p className="px-3 py-1.5 text-[10px] font-semibold text-red-600 bg-red-50 border-t border-red-200">
          {loadError}
        </p>
      )}

      {/* Input text toolbar form */}
      {isBlockedWithOther ? (
        <div className="p-3 border-t border-border bg-bg-soft text-center">
          <p className="text-[10px] font-semibold text-ink-soft">
            No podés enviar mensajes en esta conversación mientras exista un bloqueo.
          </p>
        </div>
      ) : (
        <form onSubmit={handleSendMessage} className="p-2 border-t border-border bg-white flex gap-2">
          <button
            type="button"
            onClick={() => {
              setInputText('¿Dónde definimos encontrarnos para ver el producto?');
              addLog('Asistente: Pregunta por punto de encuentro autocompletada', {});
            }}
            className="w-9 h-9 rounded-xl bg-bg-soft hover:bg-border hover:scale-110 active:scale-90 transition-all duration-200 ease-bounce flex items-center justify-center shrink-0">
            <span className="material-symbols-rounded text-[16px] text-primary">location_on</span>
          </button>

          <div className="relative flex-1">
            <input
              id="chat-message-input"
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="Escribe un mensaje..."
              disabled={sending}
              className="w-full bg-bg-soft border-none rounded-xl text-xs py-2 px-3 pr-8 focus:bg-white focus:ring-2 focus:ring-primary/25 transition-all text-ink focus:outline-none disabled:opacity-60"
            />
            <button
              id="chat-send-btn"
              type="submit"
              disabled={sending}
              className="absolute right-1 top-1 w-7 h-7 bg-primary text-white rounded-lg flex items-center justify-center hover:bg-primary hover:scale-110 hover:rotate-12 active:scale-90 transition-all duration-200 ease-bounce select-none disabled:opacity-60">
              <span className="material-symbols-rounded text-[14px]">send</span>
            </button>
          </div>
        </form>
      )}

      {showReportModal && openChat && (
        <div className="absolute inset-0 z-20 bg-black/40 flex items-center justify-center p-4 rounded-2xl">
          <div id="report-user-chat-modal" className="bg-white rounded-2xl shadow-xl max-w-xs w-full p-4 space-y-3">
            {reportSubmitted ? (
              <div className="text-center py-2 space-y-1.5">
                <span className="material-symbols-rounded text-[28px] text-emerald-500">check_circle</span>
                <p className="text-xs font-black text-ink">Gracias, recibimos tu reporte.</p>
                <button
                  type="button"
                  onClick={() => setShowReportModal(false)}
                  className="mt-2 w-full bg-primary text-white rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide">
                  Cerrar
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmitReportFromChat} className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-black text-ink">Reportar a {openChat.otherUserName}</h4>
                  <button type="button" onClick={() => setShowReportModal(false)} className="text-ink-faint hover:text-ink-soft">
                    <span className="material-symbols-rounded text-[18px]">close</span>
                  </button>
                </div>

                <div className="space-y-1">
                  {(['spam', 'estafa', 'contenido_inapropiado', 'no_corresponde', 'otro'] as ReportReason[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setReportReason(r)}
                      className={`w-full text-left px-2.5 py-1.5 rounded-lg text-[10px] font-semibold border transition-colors ${
                        reportReason === r
                          ? 'bg-primary/10 border-primary text-primary'
                          : 'bg-white border-border text-ink-soft hover:border-border'
                      }`}>
                      {REPORT_REASON_LABELS[r]}
                    </button>
                  ))}
                </div>

                <textarea
                  value={reportComment}
                  onChange={(e) => setReportComment(e.target.value)}
                  placeholder="Contanos un poco más (opcional)..."
                  maxLength={500}
                  rows={2}
                  className="w-full px-2.5 py-1.5 text-[11px] bg-white border border-border rounded-md focus:ring-1 focus:ring-primary focus:outline-none resize-none"
                />

                {reportError && <p className="text-[10px] font-semibold text-red-600">{reportError}</p>}

                <button
                  id="submit-report-from-chat-btn"
                  type="submit"
                  disabled={submittingReport}
                  className="w-full bg-primary hover:bg-primary text-white rounded-lg py-1.5 text-[10px] font-black uppercase tracking-wide disabled:opacity-60">
                  {submittingReport ? 'Enviando...' : 'Enviar reporte'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
