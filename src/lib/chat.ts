/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { supabase } from './supabaseClient';
import { ChatMessage } from '../types';

// Busca una conversación existente entre este comprador y este listing, o
// crea una nueva si es la primera vez que le escribe. Un mismo comprador
// nunca tiene dos conversaciones distintas para el mismo listing (hay un
// unique(listing_id, buyer_id) en la base).
export async function getOrCreateConversation(
  listingId: string,
  sellerId: string,
  buyerId: string
): Promise<{ conversationId: string | null; error: string | null }> {
  if (sellerId === buyerId) {
    return { conversationId: null, error: 'No podés chatear con tu propia publicación.' };
  }

  const { data: existing, error: findError } = await supabase
    .from('conversations')
    .select('id')
    .eq('listing_id', listingId)
    .eq('buyer_id', buyerId)
    .maybeSingle();

  if (findError) {
    return { conversationId: null, error: findError.message };
  }

  if (existing) {
    return { conversationId: existing.id, error: null };
  }

  const { data: created, error: createError } = await supabase
    .from('conversations')
    .insert({ listing_id: listingId, buyer_id: buyerId, seller_id: sellerId })
    .select('id')
    .single();

  if (createError) {
    return { conversationId: null, error: createError.message };
  }

  return { conversationId: created.id, error: null };
}

interface ChatMessageRow {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
}

const DEFAULT_AVATAR = 'https://images.unsplash.com/photo-1534528741775-53994a69daeb';
const DEFAULT_IMAGE = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30';

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
}

function mapRow(row: ChatMessageRow, currentUserId: string): ChatMessage {
  return {
    id: row.id,
    sender: row.sender_id === currentUserId ? 'self' : 'other',
    text: row.content,
    time: formatTime(row.created_at),
  };
}

// Trae todos los mensajes reales de una conversación, del más viejo al más nuevo.
export async function fetchMessages(
  conversationId: string,
  currentUserId: string
): Promise<{ messages: ChatMessage[]; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('id, sender_id, content, created_at')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: true });

  if (error) {
    return { messages: [], error: error.message };
  }

  return { messages: ((data ?? []) as ChatMessageRow[]).map((row) => mapRow(row, currentUserId)), error: null };
}

export interface ConversationSummary {
  conversationId: string;
  listingId: string;
  buyerId: string;
  sellerId: string;
  listingTitle: string;
  listingImage: string;
  otherUserName: string;
  otherUserAvatar: string;
  lastMessage: string | null;
  lastMessageAt: string | null;
}

interface ConversationRow {
  id: string;
  listing_id: string;
  buyer_id: string;
  seller_id: string;
  created_at: string;
}

// Trae todas las conversaciones reales del usuario (como comprador o como
// vendedor), con el nombre/foto de la OTRA persona, la publicación de la
// que se trata, y una vista previa del último mensaje. Hace varias
// consultas simples en vez de un solo join complicado para que sea más
// difícil que se rompa.
export async function fetchMyConversations(
  userId: string
): Promise<{ conversations: ConversationSummary[]; error: string | null }> {
  const { data: convos, error: convError } = await supabase
    .from('conversations')
    .select('id, listing_id, buyer_id, seller_id, created_at')
    .or(`buyer_id.eq.${userId},seller_id.eq.${userId}`);

  if (convError) {
    return { conversations: [], error: convError.message };
  }

  const rows = (convos ?? []) as ConversationRow[];
  if (rows.length === 0) {
    return { conversations: [], error: null };
  }

  const listingIds = Array.from(new Set(rows.map((c) => c.listing_id)));
  const otherUserIds = Array.from(new Set(rows.map((c) => (c.buyer_id === userId ? c.seller_id : c.buyer_id))));
  const conversationIds = rows.map((c) => c.id);

  const [listingsRes, profilesRes, messagesRes] = await Promise.all([
    supabase.from('listings').select('id, title, images').in('id', listingIds),
    supabase.from('user_profiles').select('id, display_name, avatar_url').in('id', otherUserIds),
    supabase
      .from('chat_messages')
      .select('conversation_id, content, created_at')
      .in('conversation_id', conversationIds)
      .order('created_at', { ascending: false }),
  ]);

  const listingsById = new Map((listingsRes.data ?? []).map((l: any) => [l.id, l]));
  const profilesById = new Map((profilesRes.data ?? []).map((p: any) => [p.id, p]));

  const lastMessageByConv = new Map<string, { content: string; created_at: string }>();
  for (const m of (messagesRes.data ?? []) as any[]) {
    if (!lastMessageByConv.has(m.conversation_id)) {
      lastMessageByConv.set(m.conversation_id, m);
    }
  }

  const summaries: ConversationSummary[] = rows.map((c) => {
    const otherId = c.buyer_id === userId ? c.seller_id : c.buyer_id;
    const listing = listingsById.get(c.listing_id);
    const profile = profilesById.get(otherId);
    const lastMsg = lastMessageByConv.get(c.id);

    return {
      conversationId: c.id,
      listingId: c.listing_id,
      buyerId: c.buyer_id,
      sellerId: c.seller_id,
      listingTitle: listing?.title ?? 'Publicación',
      listingImage: listing?.images?.[0] ?? DEFAULT_IMAGE,
      otherUserName: profile?.display_name ?? 'Usuario TrueK',
      otherUserAvatar: profile?.avatar_url ?? DEFAULT_AVATAR,
      lastMessage: lastMsg?.content ?? null,
      lastMessageAt: lastMsg?.created_at ?? c.created_at,
    };
  });

  summaries.sort((a, b) => new Date(b.lastMessageAt ?? 0).getTime() - new Date(a.lastMessageAt ?? 0).getTime());

  return { conversations: summaries, error: null };
}

// Qué conversaciones propias tienen algo nuevo sin leer todavía (mensaje
// de la otra persona, o una movida suya en la negociación -- oferta
// nueva, contraoferta, aceptación -- sobre ese listing). La base ya hace
// toda la comparación con la última vez que abriste cada una.
export async function fetchUnreadConversationIds(): Promise<{ unreadIds: Set<string>; error: string | null }> {
  const { data, error } = await supabase.rpc('my_conversation_unread_status');

  if (error) {
    return { unreadIds: new Set(), error: error.message };
  }

  const unreadIds = new Set(
    ((data ?? []) as { conversation_id: string; is_unread: boolean }[])
      .filter((r) => r.is_unread)
      .map((r) => r.conversation_id)
  );

  return { unreadIds, error: null };
}

// Marca una conversación puntual como leída por quien la llama (se llama
// al abrirla de verdad).
export async function markConversationRead(conversationId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.rpc('mark_conversation_read', { p_conversation_id: conversationId });
  return { error: error?.message ?? null };
}

// Guarda un mensaje real en la conversación.
export async function sendMessage(
  conversationId: string,
  senderId: string,
  content: string
): Promise<{ message: ChatMessage | null; error: string | null }> {
  const { data, error } = await supabase
    .from('chat_messages')
    .insert({ conversation_id: conversationId, sender_id: senderId, content })
    .select('id, sender_id, content, created_at')
    .single();

  if (error) {
    return { message: null, error: error.message };
  }

  return { message: mapRow(data as ChatMessageRow, senderId), error: null };
}
