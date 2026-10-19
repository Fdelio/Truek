/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ScreenType = 'onboarding' | 'publish' | 'discovery' | 'chat' | 'profile';

// Refleja la tabla public.user_profiles en Supabase.
export interface Profile {
  id: string;
  username: string;
  display_name: string;
  avatar_url: string | null;
  bio: string | null;
  location: string | null;
  // Coordenadas reales (redondeadas a ~111m) para calcular distancias de
  // verdad en el Catálogo. null = todavía no detectamos su ubicación.
  lat: number | null;
  lng: number | null;
  credits: number;
  // Créditos que ofreciste en algún trueque ya aceptado pero todavía no
  // entregado de verdad: salieron de "credits" pero no entraron a la
  // cuenta de la otra persona hasta que ambos confirmen la entrega.
  credits_held: number;
}

export interface OnboardingState {
  email: string;
  // 'idle' = todavía no se intentó; 'detecting' = esperando al navegador;
  // 'detected' = ubicación real obtenida con éxito; 'manual' = el usuario
  // la escribió a mano (sin coordenadas) porque la detección falló o no
  // dio permiso.
  locationStatus: 'idle' | 'detecting' | 'detected' | 'manual';
  locationText: string;
  locationError: string | null;
  lat: number | null;
  lng: number | null;
  selectedInterests: string[];
  progress: number;
}

export interface PhotoUpload {
  id: string;
  url: string;
  name: string;
  progress: number; // 0 to 100
  analyzed: boolean;
}

export interface PublishState {
  listingType: 'barter' | 'donation';
  photos: PhotoUpload[];
  title: string;
  description: string;
  category: string;
  // Solo aplica cuando listingType === 'barter'. Las donaciones siempre
  // se publican como exchange_type 'objeto' (sin valor en créditos).
  exchangeType: 'objeto' | 'creditos' | 'ambos';
  creditValue: string; // texto del input; se convierte a número al publicar
  exchangeSearch: string;
  selectedPreferences: string[];
  status: 'draft' | 'idle' | 'publishing' | 'live';
  // Si esta publicación es (o era) un borrador real guardado en Supabase,
  // acá queda su id — así "Guardar borrador" sucesivas veces actualiza la
  // misma fila en vez de crear copias nuevas.
  draftId: string | null;
  // Dónde se entrega ESTE artículo, que puede ser distinto de dónde vive
  // quien publica: 'profile' (default, usa la ubicación de tu perfil),
  // 'custom' (una ubicación real propia de esta publicación, con
  // coordenadas), o 'tbd' ("a definir": no se calcula distancia, se
  // coordina por chat).
  deliveryMode: 'profile' | 'custom' | 'tbd';
  deliveryLat: number | null;
  deliveryLng: number | null;
  deliveryLocationLabel: string | null; // texto legible (ej. "Palermo, Argentina"), solo con deliveryMode 'custom'
  deliveryNote: string; // nota libre opcional, visible sin importar el modo elegido
}

export interface FeedItem {
  id: string;
  title: string;
  category: string;
  type: 'barter' | 'donation';
  // en km. null = no se pudo calcular (falta la ubicación de alguna de
  // las dos partes), nunca lo mostramos como si fuera "0 km".
  distance: number | null;
  userName: string;
  userAvatar: string;
  // id real (auth.users / user_profiles) del dueño del listing. Lo
  // necesitamos para poder crear una conversación real con esa persona.
  sellerId: string;
  image: string;
  tag?: string; // e.g. "RECIÉN PUBLICADO", "SMART MATCH"
  isSmartMatch?: boolean;
  // Mismo significado que PublishState.deliveryMode: de dónde viene la
  // distancia real calculada (o por qué es null).
  deliveryMode: 'profile' | 'custom' | 'tbd';
  deliveryLocationLabel: string | null;
  deliveryNote: string | null;
}

// Refleja (mapeada) una fila de public.chat_messages.
export interface ChatMessage {
  id: string;
  sender: 'self' | 'other' | 'system';
  systemIcon?: string;
  text: string;
  time: string;
}
