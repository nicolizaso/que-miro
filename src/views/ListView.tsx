import React, { useState } from 'react';
import { useMediaStore } from '@/store';
import { MediaCard } from '@/components/MediaCard';
import { MediaStatus } from '@/types';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'motion/react';

const TABS: { id: MediaStatus; label: string }[] = [
  { id: 'por_ver', label: 'Por Ver' },
  { id: 'viendo', label: 'Viendo' },
  { id: 'completada', label: 'Completadas' },
];

export function ListView() {
  const [activeTab, setActiveTab] = useState<MediaStatus>('por_ver');
  const { mediaList } = useMediaStore();

  const filteredList = mediaList.filter(m => m.status === activeTab);

  return (
    <div className="flex flex-col gap-6 w-full max-w-5xl mx-auto px-4 pt-6 pb-24">
      <div className="flex bg-bg-card p-1 rounded-xl border border-border-card">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "flex-1 py-3 text-sm font-medium rounded-lg transition-colors relative",
              activeTab === tab.id ? "text-text-main" : "text-text-main/50 hover:text-text-main/80"
            )}
          >
            {activeTab === tab.id && (
              <motion.div
                layoutId="activeTab"
                className="absolute inset-0 bg-border-card rounded-lg"
                transition={{ type: "spring", bounce: 0.2, duration: 0.6 }}
              />
            )}
            <span className="relative z-10">{tab.label}</span>
          </button>
        ))}
      </div>

      <AnimatePresence mode="popLayout">
        {filteredList.length === 0 ? (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex flex-col items-center justify-center py-20 text-text-main/50 text-center"
          >
            <p>No tienes títulos en esta lista.</p>
            <p className="text-sm mt-2">Usa el buscador para agregar contenido.</p>
          </motion.div>
        ) : (
          <motion.div 
            layout
            className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4"
          >
            {filteredList.map(media => (
              <motion.div
                key={media.tmdbId}
                layout
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.2 }}
              >
                <MediaCard media={media} />
              </motion.div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
