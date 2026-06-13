/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { ScreenType, OnboardingState, PublishState, FeedItem, ChatState, ChatMessage } from './types';
import { INITIAL_FEED_ITEMS } from './data/mockData';
import OnboardingView from './components/OnboardingView';
import PublishView from './components/PublishView';
import DiscoveryView from './components/DiscoveryView';
import ChatView from './components/ChatView';
import SpecDocView from './components/SpecDocView';

interface LogEntry {
  id: string;
  timestamp: string;
  title: string;
  data: any;
}

export default function App() {
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('onboarding');
  const [sidebarTab, setSidebarTab] = useState<'spec' | 'console'>('spec');
  
  // Master Simulated Dev Log system
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: 'init_log',
      timestamp: new Date().toLocaleTimeString(),
      title: 'System: Sandbox TrueK Inicializado Correctamente',
      data: { platform: 'React Web Runtime (Vite)', auth: 'Offline Sandbox', cache: 'Mock Local memory nodes active' }
    }
  ]);

  const addLog = (title: string, data: any) => {
    const newLog: LogEntry = {
      id: `log_${Date.now()}_${Math.random()}`,
      timestamp: new Date().toLocaleTimeString(),
      title,
      data,
    };
    setLogs(prev => [newLog, ...prev]);
  };

  // States
  const [userAvatar, setUserAvatar] = useState<string>('https://images.unsplash.com/photo-1534528741775-53994a69daeb');

  const handleAvatarChange = (newAvatarUrl: string) => {
    setUserAvatar(newAvatarUrl);
    addLog('Usuario: Foto de perfil de TrueK actualizada por el usuario', {
      type: 'base64_data_uri',
      sourceLength: newAvatarUrl.length,
      estimated_kb: Math.round((newAvatarUrl.length * 3) / 4 / 1024),
    });
  };

  const [onboardingState, setOnboardingState] = useState<OnboardingState>({
    email: '',
    locationStatus: 'idle',
    locationText: '',
    selectedInterests: ['Tecnología'],
    progress: 15,
  });

  const [publishState, setPublishState] = useState<PublishState>({
    listingType: 'barter',
    photos: [],
    title: '',
    description: '',
    exchangeSearch: '',
    selectedPreferences: ['Abierto a todo'],
    status: 'idle',
  });

  const [feedItems, setFeedItems] = useState<FeedItem[]>(INITIAL_FEED_ITEMS);

  const [chatState, setChatState] = useState<ChatState>({
    dealStatus: 'propuesto',
    isTyping: false,
    inputValue: '',
    messages: [
      {
        id: 'msg_1',
        sender: 'system',
        systemIcon: 'info',
        text: 'Juan propuso una contraoferta',
        time: '10:42 AM',
      },
      {
        id: 'msg_2',
        sender: 'juan',
        text: '¡Hola! Vi tus zapatillas. Creo que mis auriculares serían un intercambio justo ya que están en el mismo rango de valor. ¿Qué te parece?',
        time: '10:42 AM',
      },
      {
        id: 'msg_3',
        sender: 'system',
        systemIcon: 'star',
        text: 'Smart Match sugiere que este es un trato del Top 5% para ti!',
        time: '10:44 AM',
      },
      {
        id: 'msg_4',
        sender: 'self',
        text: '¡He estado buscando esos auriculares! ¿Las almohadillas son originales o repuestos?',
        time: '10:45 AM',
      }
    ],
  });

  const handleAddFeedItem = (newItem: FeedItem) => {
    setFeedItems(prev => [newItem, ...prev]);
  };

  const handleScreenChange = (screen: ScreenType) => {
    setCurrentScreen(screen);
    addLog(`Navigation: Cambio manual de pantalla activa a "${screen.toUpperCase()}"`, {
      from: currentScreen,
      to: screen,
    });
  };

  return (
    <main className="min-h-screen bg-[#f3f4f5] text-zinc-900 font-body-md py-6 px-4 md:px-8">
      {/* Upper Navigation/Header Bar */}
      <header className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4 mb-6 pb-4 border-b border-zinc-200">
        <div className="flex items-center gap-3">
          <div className="bg-[#008378] text-white p-2 rounded-xl flex items-center justify-center shadow-md">
            <span className="material-symbols-outlined text-[28px] font-black leading-none block">swap_horiz</span>
          </div>
          <div>
            <h1 className="font-sans font-black text-2xl text-[#191c1d] tracking-tight flex items-center gap-2">
              <span>TrueK</span>
              <span className="text-xs bg-[#e1e0ff] text-[#4648d4] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">Dev Sandbox</span>
            </h1>
            <p className="text-xs text-[#6d7a77] mt-0.5">Entorno de Simulación Técnica, UX Logic y Especificaciones Técnicas</p>
          </div>
        </div>

        {/* Quick Simulator Jump Controls */}
        <div className="flex bg-white/70 border border-zinc-200 p-1.5 rounded-xl gap-1 shrink-0 backdrop-blur shadow-sm">
          {[
            { id: 'onboarding', label: '1. Registro', icon: 'assignment_ind' },
            { id: 'publish', label: '2. Posteo', icon: 'auto_awesome' },
            { id: 'discovery', label: '3. Catálogo', icon: 'explore' },
            { id: 'chat', label: '4. Negociación', icon: 'forum' },
          ].map((screen) => (
            <button
              id={`screen-jump-btn-${screen.id}`}
              key={screen.id}
              type="button"
              onClick={() => handleScreenChange(screen.id as any)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 ${
                currentScreen === screen.id
                  ? 'bg-[#008378] text-white shadow-sm'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}>
              <span className="material-symbols-outlined text-[15px]">{screen.icon}</span>
              <span>{screen.label}</span>
            </button>
          ))}
        </div>
      </header>

      {/* Main split work bench */}
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* Left column: Smartphone container emulation */}
        <section className="lg:col-span-5 flex flex-col items-center">
          <h2 className="text-xs font-extrabold text-zinc-500 uppercase tracking-widest mb-2 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-ping"></span>
            <span>Vista de Aplicación TrueK (Frente Stich)</span>
          </h2>

          {/* Device Mockup Shell */}
          <div className="w-full max-w-[390px] aspect-[9/19] bg-zinc-950 rounded-[44px] p-3 shadow-2xl border-4 border-zinc-900 relative">
            
            {/* Camera notch cutout */}
            <div className="absolute top-5 left-1/2 -translate-x-1/2 w-28 h-5 bg-black rounded-full z-50 flex items-center justify-between px-2.5">
              <div className="w-2.5 h-2.5 bg-zinc-800/80 rounded-full border border-zinc-700/50"></div>
              <div className="w-4 h-1 bg-zinc-800/80 rounded-full"></div>
            </div>

            {/* Smart Screen Canvas Content Area */}
            <div className="w-full h-full bg-white rounded-[32px] overflow-hidden relative border border-zinc-800/10 flex flex-col justify-between">
              
              {/* Internal Display Top Status Bar */}
              <div className="bg-white/80 backdrop-blur text-zinc-800 h-8 flex justify-between items-end px-5 pb-1 text-[10px] font-bold z-40 shrink-0">
                <span>10:46 AM</span>
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px] leading-none">signal_cellular_alt</span>
                  <span className="material-symbols-outlined text-[13px] leading-none">wifi</span>
                  <span className="material-symbols-outlined text-[13px] leading-none">battery_full</span>
                </div>
              </div>

              {/* App Brand Header Fijo */}
              <div className="bg-[#00685f] text-white px-4 py-2.5 flex justify-between items-center shadow-md z-40 shrink-0 select-none border-b border-[#004f48]">
                <div className="flex items-center gap-1.5 cursor-pointer hover:scale-103 transition-transform" onClick={() => handleScreenChange('discovery')}>
                  <span className="material-symbols-outlined text-[20px] font-extrabold leading-none rotate-12 text-[#89f5e7]">swap_horiz</span>
                  <span className="font-sans font-black text-sm tracking-tighter text-[#f4fffc]">TrueK</span>
                </div>
                
                {/* Uploadable user profile picture with hidden file input */}
                <div className="flex items-center gap-2">
                  <span className="text-[9px] text-[#89f5e7] font-bold tracking-wider uppercase hidden min-[320px]:inline">Mi Perfil</span>
                  <div className="relative group cursor-pointer">
                    <label htmlFor="user-profile-upload-input" className="cursor-pointer block relative">
                      <img 
                        alt="Perfil de Usuario" 
                        src={userAvatar} 
                        className="w-7 h-7 rounded-full object-cover border border-[#89f5e7] hover:border-white shadow-sm hover:scale-105 active:scale-95 transition-all duration-200"
                      />
                      <div className="absolute inset-0 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity duration-200">
                        <span className="material-symbols-outlined text-[10px] text-white font-bold">edit</span>
                      </div>
                    </label>
                    <input 
                      id="user-profile-upload-input"
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) {
                          const reader = new FileReader();
                          reader.onload = (event) => {
                            if (event.target?.result) {
                              handleAvatarChange(event.target.result as string);
                            }
                          };
                          reader.readAsDataURL(file);
                        }
                      }}
                    />
                  </div>
                </div>
              </div>

              {/* Dynamic Screen Injector */}
              <div id="emulator-screen-viewer" className="flex-1 w-full overflow-hidden relative">
                {currentScreen === 'onboarding' && (
                  <OnboardingView
                    onboardingState={onboardingState}
                    setOnboardingState={setOnboardingState}
                    onAdvance={() => handleScreenChange('publish')}
                    addLog={addLog}
                  />
                )}
                {currentScreen === 'publish' && (
                  <PublishView
                    publishState={publishState}
                    setPublishState={setPublishState}
                    addFeedItem={handleAddFeedItem}
                    onAdvance={() => handleScreenChange('discovery')}
                    addLog={addLog}
                    userAvatar={userAvatar}
                  />
                )}
                {currentScreen === 'discovery' && (
                  <DiscoveryView
                    feedItems={feedItems}
                    onStartChat={() => handleScreenChange('chat')}
                    addLog={addLog}
                  />
                )}
                {currentScreen === 'chat' && (
                  <ChatView
                    chatState={chatState}
                    setChatState={setChatState}
                    addLog={addLog}
                  />
                )}
              </div>

              {/* Internal Display Bottom Screen Bar Indicator */}
              <div className="bg-white/80 h-4 border-t border-zinc-100 flex items-center justify-center z-40 shrink-0">
                <div className="w-24 h-1 bg-zinc-800 rounded-full"></div>
              </div>

            </div>
          </div>
        </section>

        {/* Right column: Interactive Behavior Spec Workbook & Telemetry Log stream */}
        <section className="lg:col-span-7 space-y-4">
          
          {/* Tabs Selector for documentation panel */}
          <div className="flex border-b border-zinc-200">
            <button
              id="sidebar-tab-btn-spec"
              type="button"
              onClick={() => setSidebarTab('spec')}
              className={`px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                sidebarTab === 'spec'
                  ? 'border-b-2 border-[#00685f] text-[#00685f]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}>
              <span className="material-symbols-outlined text-[16px]">menu_book</span>
              <span>Especificación de Flujo</span>
            </button>
            <button
              id="sidebar-tab-btn-console"
              type="button"
              onClick={() => setSidebarTab('console')}
              className={`px-5 py-2.5 text-xs font-bold transition-all flex items-center gap-1.5 ${
                sidebarTab === 'console'
                  ? 'border-b-2 border-[#fea619] text-[#6a4200]'
                  : 'text-zinc-500 hover:text-zinc-800'
              }`}>
              <span className="material-symbols-outlined text-[16px]">terminal</span>
              <span>Consola de Datos Simulados</span>
              <span className="bg-zinc-200 text-zinc-700 text-[10px] px-1.5 py-0.5 rounded-full font-sans font-semibold">
                {logs.length}
              </span>
            </button>
          </div>

          <div className="bg-white rounded-2xl shadow-md overflow-hidden border border-zinc-200">
            {sidebarTab === 'spec' ? (
              <SpecDocView />
            ) : (
              // Colored JSON Real-time stream console log
              <div className="flex flex-col h-[#700px] bg-zinc-900 border border-zinc-800 text-green-400 font-mono text-xs overflow-hidden">
                <div className="bg-zinc-950 p-3 flex justify-between items-center text-zinc-500 text-[10px] font-bold select-none border-b border-zinc-800 shrink-0">
                  <span className="flex items-center gap-1">
                    <span className="w-1.5 h-1.5 bg-[#fea619] rounded-full animate-pulse"></span>
                    <span>Consola de Trazas de Backend Ficticio</span>
                  </span>
                  <button 
                    id="console-clear-btn"
                    type="button" 
                    onClick={() => {
                      setLogs([{ id: 'clear_done', timestamp: new Date().toLocaleTimeString(), title: 'Trazas reiniciadas por el operador', data: {} }]);
                    }}
                    className="text-zinc-400 hover:text-white flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[11px] leading-none">delete</span>
                    <span>Limpiar</span>
                  </button>
                </div>

                <div id="console-logs-list" className="flex-1 p-3 overflow-y-auto space-y-2 max-h-[660px]">
                  {logs.map((log) => (
                    <div key={log.id} className="border-b border-zinc-800 pb-2 space-y-1">
                      <div className="flex justify-between items-center text-[10px]">
                        <span className="text-cyan-400 font-extrabold">{log.title}</span>
                        <span className="text-zinc-500">{log.timestamp}</span>
                      </div>
                      
                      {Object.keys(log.data).length > 0 && (
                        <pre className="text-[10px] text-green-300 bg-black/40 p-1.5 rounded overflow-x-auto border border-zinc-850/40">
                          {JSON.stringify(log.data, null, 2)}
                        </pre>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

        </section>

      </div>
    </main>
  );
}
