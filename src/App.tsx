import React, { useState, useEffect } from 'react';
import { Search, Film, Tv, User, LayoutGrid, Shuffle } from 'lucide-react';
import { ListView } from '@/views/ListView';
import { SmartPickerView } from '@/views/SmartPickerView';
import { ProfileView } from '@/views/ProfileView';
import { SearchModal } from '@/components/SearchModal';
import { cn } from '@/lib/utils';

type TabId = 'list' | 'picker' | 'profile';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabId>('list');
  const [isSearchOpen, setIsSearchOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className="min-h-screen bg-bg-main text-text-main font-sans selection:bg-accent/30 flex flex-col">
      {/* Top Header */}
      <header className="sticky top-0 z-40 bg-bg-main/80 backdrop-blur-md border-b border-border-card h-16 flex items-center justify-between px-4 sm:px-6">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-accent flex items-center justify-center">
            <Film size={20} className="text-bg-main" />
          </div>
          <h1 className="font-serif italic font-bold text-xl tracking-tight">Qué Miro?</h1>
        </div>
        
        <button 
          onClick={() => setIsSearchOpen(true)}
          className="hidden sm:flex items-center gap-2 bg-bg-card border border-border-card px-4 py-2 rounded-xl text-text-main/50 hover:bg-border-card transition-colors"
        >
          <Search size={16} />
          <span className="text-sm">Buscar...</span>
          <kbd className="hidden md:inline-flex items-center gap-1 bg-bg-main px-1.5 py-0.5 rounded border border-border-card text-[10px] font-medium uppercase ml-4">
            <span className="text-xs">⌘</span>K
          </kbd>
        </button>

        <button 
          onClick={() => setIsSearchOpen(true)}
          className="sm:hidden p-2 text-text-main hover:bg-border-card rounded-full"
        >
          <Search size={24} />
        </button>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-x-hidden">
        {activeTab === 'list' && <ListView />}
        {activeTab === 'picker' && <SmartPickerView />}
        {activeTab === 'profile' && <ProfileView />}
      </main>

      {/* Bottom Navigation (Mobile mostly, but we'll keep it for desktop for simplicity of SPA) */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 bg-bg-main/90 backdrop-blur-lg border-t border-border-card pb-safe h-20 sm:h-24">
        <div className="max-w-lg mx-auto h-full flex items-center justify-around px-4">
          <button 
            onClick={() => setActiveTab('list')}
            className={cn("flex flex-col items-center gap-1 p-2 transition-colors", activeTab === 'list' ? 'text-accent' : 'text-text-main/50')}
          >
            <LayoutGrid size={24} />
            <span className="text-[10px] font-medium">Mis Listas</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('picker')}
            className="flex flex-col items-center gap-1 p-2 -mt-6 group"
          >
            <div className={cn("w-14 h-14 rounded-full flex items-center justify-center transition-all shadow-lg", activeTab === 'picker' ? 'bg-accent text-white scale-110' : 'bg-bg-card border border-border-card text-text-main group-hover:scale-105')}>
              <Shuffle size={24} />
            </div>
            <span className={cn("text-[10px] font-medium", activeTab === 'picker' ? 'text-accent' : 'text-text-main/50')}>Picker</span>
          </button>

          <button 
            onClick={() => setActiveTab('profile')}
            className={cn("flex flex-col items-center gap-1 p-2 transition-colors", activeTab === 'profile' ? 'text-accent' : 'text-text-main/50')}
          >
            <User size={24} />
            <span className="text-[10px] font-medium">Perfil</span>
          </button>
        </div>
      </nav>

      <SearchModal isOpen={isSearchOpen} onClose={() => setIsSearchOpen(false)} />
    </div>
  );
}
