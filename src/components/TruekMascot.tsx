/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';

// "Pepe" el tucán: la mascota de TrueK. Vive como SVG puro (igual que el
// ícono del logo) para no sumar ningún asset de imagen — reutilizable en
// cualquier estado vacío o pantalla donde queramos darle un poco de
// personalidad a la marca en vez de un ícono gris genérico.
export default function TruekMascot({ className = 'w-16 h-16' }: { className?: string }) {
  return (
    <svg viewBox="0 0 200 200" className={className} aria-hidden="true">
      {/* Cola */}
      <path d="M70 150 Q40 160 35 185 Q65 180 80 160 Z" fill="#1f4a2e" />
      {/* Cuerpo */}
      <ellipse cx="105" cy="130" rx="48" ry="52" fill="#2d5f3e" />
      {/* Panza */}
      <ellipse cx="100" cy="145" rx="28" ry="32" fill="#9ccb3b" />
      {/* Cabeza */}
      <circle cx="90" cy="78" r="38" fill="#1f4a2e" />
      {/* Parche del ojo */}
      <circle cx="90" cy="78" r="30" fill="white" />
      <circle cx="96" cy="80" r="9" fill="#2b1d0e" />
      <circle cx="99" cy="76" r="3" fill="white" />
      {/* Pico (coral + dorado, como el acento de la marca) */}
      <path d="M118 72 C165 62 185 78 183 92 C181 104 150 108 120 98 Z" fill="#e8b923" />
      <path d="M122 84 C150 80 168 86 175 93" stroke="#ff7a45" strokeWidth="5" fill="none" strokeLinecap="round" />
      {/* Objeto en el pico, gesto de "trueque" */}
      <rect x="178" y="80" width="14" height="14" rx="3" fill="#ff7a45" transform="rotate(18 185 87)" />
      {/* Patas */}
      <path d="M90 180 L84 195 M90 180 L96 195 M90 180 L90 197" stroke="#e8b923" strokeWidth="4" strokeLinecap="round" />
      <path d="M122 180 L116 195 M122 180 L128 195 M122 180 L122 197" stroke="#e8b923" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}
