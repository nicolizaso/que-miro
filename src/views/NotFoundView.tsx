import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFoundView() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto pb-24">
      <Compass className="text-border-card w-16 h-16 mb-6" aria-hidden="true" />
      <h2 className="font-serif italic font-bold text-3xl mb-2">
        Esta página no existe
      </h2>
      <p className="text-text-muted mb-8">
        El link que seguiste no lleva a ninguna parte.
      </p>
      <Link
        to="/"
        className="bg-accent text-accent-contrast px-6 py-3 rounded-xl font-medium hover:opacity-90 transition-opacity"
      >
        Volver a mis listas
      </Link>
    </div>
  );
}
