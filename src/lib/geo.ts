/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface Coordinates {
  lat: number;
  lng: number;
}

// Redondeamos a 3 decimales (~111 metros de precisión) antes de guardar
// en Supabase: alcanza de sobra para calcular distancias reales entre
// usuarios, pero no expone la ubicación exacta de la casa de nadie.
function roundCoord(n: number): number {
  return Math.round(n * 1000) / 1000;
}

// Pide la ubicación real del navegador (requiere HTTPS o localhost, y que
// el usuario lo autorice). Nunca rechaza la promesa: devuelve
// {coords: null, error: '...'} si falla, para que el llamador no necesite
// un try/catch.
export async function requestBrowserLocation(): Promise<{ coords: Coordinates | null; error: string | null }> {
  if (!('geolocation' in navigator)) {
    return { coords: null, error: 'Este navegador no soporta geolocalización.' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            lat: roundCoord(position.coords.latitude),
            lng: roundCoord(position.coords.longitude),
          },
          error: null,
        });
      },
      (err) => {
        const message =
          err.code === err.PERMISSION_DENIED
            ? 'No nos diste permiso para acceder a tu ubicación.'
            : err.code === err.TIMEOUT
            ? 'Se agotó el tiempo esperando tu ubicación.'
            : 'No se pudo obtener tu ubicación.';
        resolve({ coords: null, error: message });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 }
    );
  });
}

// Convierte coordenadas en un texto legible ("Ciudad, País") usando el
// servicio gratuito de OpenStreetMap (Nominatim). Es un "mejor esfuerzo":
// si falla (sin red, límite de uso, etc.) devolvemos null y el que llama
// cae a un texto genérico — nunca hace falta esto para que la distancia
// real funcione, es solo cosmético.
export async function reverseGeocode(coords: Coordinates): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${coords.lat}&lon=${coords.lng}&format=jsonv2`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const address = data?.address ?? {};
    const city = address.city || address.town || address.village || address.suburb || address.county;
    const country = address.country;

    if (city && country) return `${city}, ${country}`;
    if (data?.display_name) return data.display_name;
    return null;
  } catch {
    return null;
  }
}

// Geocodificación "directa": convierte un texto de dirección/zona escrito
// a mano (ej. "Palermo, Buenos Aires") en coordenadas reales, usando el
// mismo servicio gratuito de Nominatim. Se usa para fijar la ubicación de
// entrega de una publicación sin necesidad de estar físicamente ahí (a
// diferencia de requestBrowserLocation, que usa el GPS de donde estás
// parado ahora). Devuelve null si no hay resultados o falla la búsqueda.
export async function forwardGeocode(query: string): Promise<{ coords: Coordinates; label: string } | null> {
  const trimmed = query.trim();
  if (trimmed === '') return null;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(trimmed)}&format=jsonv2&limit=1`,
      { signal: controller.signal, headers: { Accept: 'application/json' } }
    );
    clearTimeout(timeout);

    if (!res.ok) return null;

    const data = await res.json();
    const first = Array.isArray(data) ? data[0] : null;
    if (!first) return null;

    const lat = parseFloat(first.lat);
    const lng = parseFloat(first.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

    return {
      coords: { lat: roundCoord(lat), lng: roundCoord(lng) },
      label: first.display_name ?? trimmed,
    };
  } catch {
    return null;
  }
}

// Distancia en texto, lista para mostrar en la UI. null = desconocida
// (todavía no tenemos las coordenadas de alguna de las dos partes).
export function formatDistance(distanceKm: number | null): string {
  if (distanceKm === null) return 'Distancia desconocida';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${Math.round(distanceKm)} km`;
}
