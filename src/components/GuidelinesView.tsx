/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import TruekMascot from './TruekMascot';

interface GuidelinesViewProps {
  // Si está presente, se muestra como una pantalla "modal" compacta con
  // un botón de aceptar (usada durante el registro). Si no, se muestra
  // como pantalla completa de solo lectura (accedida desde el Perfil).
  onAccept?: () => void;
  onClose?: () => void;
}

export default function GuidelinesView({ onAccept, onClose }: GuidelinesViewProps) {
  const isModal = Boolean(onAccept);

  const content = (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <TruekMascot className="w-12 h-12 shrink-0" />
        <div>
          <h1 className="font-display text-xl font-black text-ink-dark leading-none">Normas de la comunidad</h1>
          <p className="text-[11px] text-ink-soft mt-0.5">Para que TrueK siga siendo un buen lugar para toda la comunidad</p>
        </div>
      </div>

      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-primary-dark">¿Para qué existe TrueK?</h2>
        <p className="text-xs text-ink-soft leading-relaxed">
          TrueK es un espacio para intercambiar o donar, con personas cerca tuyo, cosas que ya no usás, en vez de
          tirarlas. Funciona porque la comunidad que lo usa actúa de buena fe: publica cosas reales, cumple lo que
          acuerda por el chat y trata a la otra persona con el mismo respeto que esperás que tengan con vos.
        </p>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-primary-dark">Lo que esperamos de quienes usan TrueK</h2>
        <ul className="text-xs text-ink-soft leading-relaxed list-disc pl-4 space-y-1">
          <li>Publicar artículos que realmente tenés y que son legales de poseer e intercambiar.</li>
          <li>Describir el estado real del artículo, sin engañar a la otra persona.</li>
          <li>Coordinar la entrega en un lugar seguro, preferentemente público y de día.</li>
          <li>Tratar a las demás personas con respeto, incluso si un trueque no se termina concretando.</li>
          <li>Reportar o bloquear a quien tenga un comportamiento sospechoso, en vez de seguirle el juego.</li>
        </ul>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-red-700">Está prohibido publicar u ofrecer</h2>
        <ul className="text-xs text-ink-soft leading-relaxed list-disc pl-4 space-y-1">
          <li>Armas, réplicas de armas, municiones o explosivos.</li>
          <li>Drogas, medicamentos sin receta o cualquier sustancia controlada.</li>
          <li>Animales vivos, o artículos de origen animal protegido.</li>
          <li>Artículos robados, falsificados, o cuya procedencia no puedas garantizar.</li>
          <li>Contenido o servicios sexuales, y cualquier cosa que involucre a menores de edad.</li>
          <li>Cualquier otro artículo o servicio cuya venta, tenencia o intercambio sea ilegal en Argentina.</li>
        </ul>
        <p className="text-xs text-ink-soft leading-relaxed">
          Publicar algo de esta lista hace que tu cuenta pueda ser suspendida, y según el caso puede ser también un
          delito del que sos responsable vos, no TrueK.
        </p>
      </section>

      <section className="space-y-1.5">
        <h2 className="text-sm font-bold text-primary-dark">Recomendaciones para trueques más seguros</h2>
        <ul className="text-xs text-ink-soft leading-relaxed list-disc pl-4 space-y-1">
          <li>Charlá los detalles por el chat de la app antes de acordar una entrega.</li>
          <li>Si algo te genera dudas (el precio, la historia, la urgencia de la otra persona), confiá en esa duda.</li>
          <li>Preferí encontrarte en un lugar público, y si podés, avisale a alguien de confianza dónde vas a estar.</li>
          <li>Revisá el artículo antes de confirmar la entrega como concretada.</li>
          <li>Usá "Reportar" o "Bloquear" apenas detectes algo raro — no hace falta esperar a que termine mal.</li>
        </ul>
      </section>

      <section className="space-y-1.5 bg-bg-soft rounded-xl p-3">
        <h2 className="text-sm font-bold text-ink-dark">Qué hace TrueK, y qué no</h2>
        <p className="text-xs text-ink-soft leading-relaxed">
          TrueK es un punto de encuentro: te ayuda a encontrar personas cerca con quienes intercambiar o donar
          cosas, pero no participa de la entrega, no inspecciona los artículos y no interviene en el acuerdo entre
          las partes. Cada trueque o donación es un acuerdo directo entre las personas involucradas, bajo su propia
          responsabilidad.
        </p>
        <p className="text-xs text-ink-soft leading-relaxed">
          En la medida permitida por la ley, TrueK y quienes lo desarrollan no son responsables por la calidad,
          legalidad o seguridad de los artículos publicados, por la veracidad de lo que dice quien publica, ni por lo
          que pase durante un encuentro o entrega acordado entre las partes. Si tenés un problema con otra persona o
          con un artículo publicado, por favor reportalo desde la app para que podamos revisarlo.
        </p>
      </section>
    </div>
  );

  if (!isModal) {
    return (
      <div id="guidelines-view" className="flex-1 w-full max-w-2xl mx-auto px-4 py-5">
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="mb-3 text-[11px] font-semibold text-primary hover:underline flex items-center gap-1">
            <span className="material-symbols-rounded text-[16px]">arrow_back</span>
            Volver a Mi Perfil
          </button>
        )}
        {content}
      </div>
    );
  }

  return (
    <div id="guidelines-modal" className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-canvas rounded-2xl max-w-lg w-full max-h-[85vh] overflow-y-auto p-5 shadow-xl">
        {content}
        <button
          id="guidelines-accept-btn"
          type="button"
          onClick={onAccept}
          className="mt-5 w-full py-3 bg-primary text-white rounded-xl font-semibold text-xs hover:bg-primary-dark active:scale-95 transition-all">
          Entendido, acepto las normas de la comunidad
        </button>
      </div>
    </div>
  );
}
