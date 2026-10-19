/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';

export default function SpecDocView() {
  const [activeTab, setActiveTab] = useState<'intro' | 'geolocation' | 'smart_post' | 'chat_neg' | 'filters'>('intro');

  return (
    <div className="flex flex-col h-[#700px] bg-white rounded-2xl shadow-sm border border-zinc-200 overflow-hidden font-body-md text-[#191c1d]">
      
      {/* Top Tab Switchers */}
      <div className="bg-zinc-50 border-b border-zinc-200 overflow-x-auto flex scrollbar-none whitespace-nowrap shrink-0">
        {[
          { id: 'intro', label: 'PM Spec' },
          { id: 'geolocation', label: 'A. Geolocalización' },
          { id: 'smart_post', label: 'B. Posteo Inteligente' },
          { id: 'chat_neg', label: 'C. Negociación' },
          { id: 'filters', label: 'D. Filtros Optimistas' },
        ].map((tab) => (
          <button
            id={`spec-tab-btn-${tab.id}`}
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id as any)}
            className={`px-4 py-3.5 text-xs font-bold transition-all border-b-2 flex items-center gap-1.5 ${
              activeTab === tab.id 
                ? 'border-[#008378] text-[#00685f] bg-white font-extrabold' 
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
            }`}>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Main Spec Content Reader Body */}
      <div id="spec-doc-content-container" className="flex-1 overflow-y-auto p-5 md:p-6 space-y-6">
        
        {activeTab === 'intro' && (
          <div className="space-y-4">
            <div className="bg-[#e1e0ff]/40 p-4 rounded-xl border border-[#e1e0ff]/65">
              <span className="text-[10px] font-bold text-[#4648d4] uppercase tracking-wider">TrueK Product Spec</span>
              <h3 className="text-lg font-black text-[#191c1d] leading-none mt-1">Especificación de Comportamiento e Interacción de UX Logic</h3>
              <p className="text-xs text-[#3d4947] mt-1.5">
                Bienvenido al documento formal de UX Logic de <strong>TrueK</strong>. Este prototipo interactivo actúa tanto de sandbox de pruebas como de plano técnico para ingeniería. Describe y programa cómo reacciona cada pantalla a las acciones de entrada del cliente.
              </p>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-extrabold text-[#00685f]">Objetivo de Negocio</h4>
              <p className="text-xs text-zinc-600 leading-relaxed">
                Facilitar intercambios peer-to-peer rápidos y seguros mediante un ecosistema local de confianza. El motor de TrueK combina gamificación local (Swapping) y solidaridad (Donaciones de Comunidad) eliminando la fricción de los avisos clasificados tradicionales.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3 mt-4">
              <div className="border border-zinc-150 p-3 rounded-lg bg-zinc-50/50">
                <span className="material-symbols-outlined text-[18px] text-[#008378] mb-1">dashboard</span>
                <span className="block text-xs font-bold">100% Interactivo</span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">Navega libremente con el emulador móvil de la izquierda.</span>
              </div>
              <div className="border border-zinc-150 p-3 rounded-lg bg-zinc-50/50">
                <span className="material-symbols-outlined text-[18px] text-[#fea619] mb-1">terminal</span>
                <span className="block text-xs font-bold">Consola de Eventos</span>
                <span className="text-[10px] text-zinc-500 block mt-0.5">Observa las trazas de datos simulados en la base de la pantalla.</span>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'geolocation' && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#191c1d] pb-2 border-b border-zinc-150">A. Flujo de Geolocalización en Registro</h3>
            
            <div className="bg-zinc-50 p-3 rounded-xl space-y-1.5 border border-zinc-200">
              <span className="text-[9px] font-bold text-[#008378]">ESTADO INICIAL</span>
              <p className="text-xs font-semibold text-zinc-700">Detectando zona de intercambio...</p>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Al inicializar el onboarding, la UI renderiza el widget de zona con un estado indeterminado. Mostrará un spinner de progreso suave dentro del frame de mapa grayscale.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Triggers de Interacción (Eventos)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Cambio de estado temporizado (Auto-Trigger):</strong> Transcurridos 1.5s desde el renderizado inicial, el hilo cliente invoca la georreferenciación.</li>
                <li><strong>Simulación alternativa:</strong> En el simulador, el usuario puede forzar coordenadas ingresando con cuentas sociales.</li>
              </ul>
            </div>

            <div className="space-y-2 text-xs font-sans">
              <h4 className="font-extrabold text-zinc-800">Cambios de Estado en UI (Micro-interacciones)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Transición de Fade In-Out:</strong> El texto cambia con un retardo de opacidad para evitar saltos bruscos.</li>
                <li><strong>Notificación visual:</strong> Se enciende un pin naranja en la zona central con un patrón circular de ondas ("Pulse Soft").</li>
              </ul>
            </div>

            <div className="space-y-1.5 bg-[#f4fffc] border border-[#008378]/25 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-[#008378] block">FLUJO DE DATOS SIMULADO (JSON PAYLOAD)</span>
              <pre className="text-[10px] font-mono text-emerald-800 bg-white/70 p-2 rounded-lg leading-relaxed overflow-x-auto">
{`{
  "event": "gps_position_resolved",
  "coordinates": [4.7110, -74.0721],
  "payload": {
    "detected_zone": "Bogotá, Colombia",
    "accuracy_meters": 12,
    "nearest_nodes_count": 84
  }
}`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'smart_post' && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#191c1d] pb-2 border-b border-zinc-150">B. Flujo "Posteo Inteligente"</h3>

            <div className="bg-zinc-50 p-3 rounded-xl space-y-1.5 border border-zinc-200">
              <span className="text-[9px] font-bold text-[#008378]">ESTADO INICIAL</span>
              <p className="text-xs font-semibold text-zinc-700">Formulario listo, cargador esperando media</p>
              <p className="text-[11px] text-zinc-500 leading-normal">
                La UI muestra el botón de añadir media inactivo con un borde discontinuo color tiza y el distintivo inteligente "IA: Etiquetado inteligente activo" indicando disponibilidad.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Triggers de Interacción (Eventos)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Click en preset de carga ("Reloj" o "Audífonos"):</strong> Detona la carga binaria asíncrona simulada.</li>
                <li><strong>Click en "Publicar ahora":</strong> Vuelve el artículo persistente en el hub local.</li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Cambios de Estado en UI (Micro-interacciones)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Progreso de anillo circular SVG:</strong> Se autocompleta de 0% a 100% reflejando el estado de transferencia en tiempo real en los thumbnails.</li>
                <li><strong>Autocompletado de campos analizados:</strong> Títulos, descripciones y sugerencias de categorías se auto-completan con una transición suave después del análisis local.</li>
              </ul>
            </div>

            <div className="space-y-1.5 bg-[#f4fffc] border border-[#008378]/25 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-[#008378] block">FLUJO DE DATOS SIMULADO (JSON PAYLOAD)</span>
              <pre className="text-[10px] font-mono text-emerald-800 bg-white/70 p-2 rounded-lg leading-relaxed overflow-x-auto">
{`{
  "ai_analyzer_status": "complete",
  "vision_inference": {
    "detected_subject": "Minimalist Wristwatch",
    "suggested_tags": ["Electrónica", "Wearables", "Premium"],
    "confidence_score": 0.985
  }
}`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'chat_neg' && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#191c1d] pb-2 border-b border-zinc-150">C. Flujo de Negociación (Chat)</h3>

            <div className="bg-zinc-50 p-3 rounded-xl space-y-1.5 border border-zinc-200">
              <span className="text-[9px] font-bold text-[#008378]">ESTADO INICIAL</span>
              <p className="text-xs font-semibold text-zinc-700">Estado: PROPUESTO, Match 94%</p>
              <p className="text-[11px] text-zinc-500 leading-normal">
                El chat muestra la conversación entre el usuario y "Juan D.". La tarjeta comparativa destaca que la coincidencia calculada por el algoritmo de TrueK es del 94%.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Triggers de Interacción (Eventos)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Click en Aceptar trueque:</strong> Sella de inmediato el progreso y pasa el estado a "Aceptado".</li>
                <li><strong>Envío de comandos contextuales:</strong> Escribir e indicar palabras de geografía como "lugar" o "Starbucks" despliega el nodo de hito de "CITA".</li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-[#008378]">Simulación de Progreso ("Aceptado")</h4>
              <p className="text-[11px] text-zinc-500 leading-normal mb-1">
                Al accionar el botón o recibir un mensaje de confirmación, la barra se actualiza optimísticamente mediante transiciones de color e hidratación.
              </p>
              <div className="flex gap-2 text-[10px]">
                <span className="bg-[#008378]/10 text-[#008378] px-2 py-0.5 rounded-full font-bold">Propuesto ➔</span>
                <span className="bg-[#fea619]/10 text-amber-700 px-2 py-0.5 rounded-full font-bold">Aceptado ➔</span>
                <span className="bg-zinc-100 text-zinc-500 px-2 py-0.5 rounded-full font-bold">Cita ➔ completado</span>
              </div>
            </div>

            <div className="space-y-1.5 bg-[#f4fffc] border border-[#008378]/25 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-[#008378] block">FLUJO DE DATOS SIMULADO (JSON PAYLOAD)</span>
              <pre className="text-[10px] font-mono text-emerald-800 bg-white/70 p-2 rounded-lg leading-relaxed overflow-x-auto">
{`{
  "interaction_id": "itr_94_juan_d",
  "smart_match_score": 0.94,
  "transaction_state": "aceptado",
  "blockchain_escrow_held": true
}`}
              </pre>
            </div>
          </div>
        )}

        {activeTab === 'filters' && (
          <div className="space-y-4">
            <h3 className="text-base font-black text-[#191c1d] pb-2 border-b border-zinc-150">D. Comportamiento de Filtros</h3>

            <div className="bg-zinc-50 p-3 rounded-xl space-y-1.5 border border-zinc-200">
              <span className="text-[9px] font-bold text-[#008378]">ESTADO INICIAL</span>
              <p className="text-xs font-semibold text-zinc-700">Rango por defecto: 15 o 30 Km</p>
              <p className="text-[11px] text-zinc-500 leading-normal">
                Muestra todos los artículos de la red que cumplen con la distancia inicial configurada.
              </p>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Triggers de Interacción (Eventos)</h4>
              <ul className="list-disc pl-5 text-zinc-650 space-y-1">
                <li><strong>Desplazar slider de kilómetros:</strong> Realiza un filtrado dinámico local en el hub virtual.</li>
                <li><strong>Selector de pestañas categóricas:</strong> Cambia las reglas de ordenación en memoria.</li>
              </ul>
            </div>

            <div className="space-y-2 text-xs">
              <h4 className="font-extrabold text-zinc-800">Actualización Optimista ("Optimistic Update")</h4>
              <p className="text-[11px] text-zinc-500 leading-normal">
                En lugar de bloquear toda la pantalla con un loader global, la UI muestra un <em>skeleton glow</em> de baja fidelidad en el feed durante <strong>300ms</strong> mientras calcula la consulta espacial localmente. Esto elimina la percepción de retraso de red y proporciona un feedback táctil sobresaliente.
              </p>
            </div>

            <div className="space-y-1.5 bg-[#f4fffc] border border-[#008378]/25 p-3 rounded-xl">
              <span className="text-[9px] font-bold text-[#008378] block">FLUJO DE DATOS SIMULADO (JSON PAYLOAD)</span>
              <pre className="text-[10px] font-mono text-emerald-800 bg-white/70 p-2 rounded-lg leading-relaxed overflow-x-auto">
{`{
  "operation": "spatial_distance_query",
  "parameters": {
    "origin_coordinates": [4.711, -74.072],
    "max_distance_limit_km": 15
  },
  "client_render_fallback": "local_memory_cache"
}`}
              </pre>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
