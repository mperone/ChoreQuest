import { useState, useEffect } from 'react';
import { RefreshCw, ShieldAlert } from 'lucide-react';

export default function UpdatePrompt() {
  const [registration, setRegistration] = useState(null);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    const handler = (e) => setRegistration(e.detail);
    window.addEventListener('sw:update-available', handler);
    return () => window.removeEventListener('sw:update-available', handler);
  }, []);

  const handleUpdate = () => {
    setRefreshing(true);
    if (registration?.waiting) {
      registration.waiting.postMessage('SKIP_WAITING');
      // controllerchange listener in main.jsx will auto-reload
      window.setTimeout(() => window.location.reload(), 2000);
      return;
    }
    window.location.reload();
  };

  useEffect(() => {
    const handler = () => setUpdateRequired(true);
    window.addEventListener('app:update-required', handler);
    return () => window.removeEventListener('app:update-required', handler);
  }, []);

  if (updateRequired) {
    return (
      <div className="fixed inset-0 z-[9999] bg-navy/95 backdrop-blur-sm flex items-center justify-center p-4">
        <div className="game-panel max-w-sm w-full p-6 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-accent/15 text-accent mx-auto flex items-center justify-center">
            <ShieldAlert size={24} />
          </div>
          <div>
            <h2 className="text-cream text-base font-semibold">
              Update Required
            </h2>
            <p className="text-muted text-sm mt-2">
              ChoreQuest was updated. Refresh to continue safely.
            </p>
          </div>
          <button
            onClick={handleUpdate}
            disabled={refreshing}
            className="game-btn game-btn-blue w-full flex items-center justify-center gap-2"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            {refreshing ? 'Refreshing...' : 'Refresh Now'}
          </button>
        </div>
      </div>
    );
  }

  if (!registration?.waiting) return null;

  return (
    <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[9999] animate-in fade-in slide-in-from-top-2">
      <button
        onClick={handleUpdate}
        disabled={refreshing}
        className="flex items-center gap-2 bg-accent hover:bg-accent/90 text-white
                   text-sm font-medium px-4 py-2.5 rounded-md
                   transition-colors disabled:opacity-70"
      >
        <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
        {refreshing ? 'Refreshing...' : 'Update available — tap to refresh'}
      </button>
    </div>
  );
}
