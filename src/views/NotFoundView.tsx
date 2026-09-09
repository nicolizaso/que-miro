import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';

export function NotFoundView() {
  return (
    <div className="flex flex-col items-center justify-center py-24 px-4 text-center max-w-md mx-auto">
      <Compass className="text-border-card w-16 h-16 mb-6" aria-hidden="true" />
      <h1 className="text-display mb-2">
        Esta página no existe
      </h1>
      <p className="text-text-muted mb-8">
        El link que seguiste no lleva a ninguna parte.
      </p>
      <Link
        to="/"
        className="btn btn-primary px-6 py-3"
      >
        Volver a mis listas
      </Link>
    </div>
  );
}
