import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Toast from './Toast';

const offlinePrefix = 'offline_form_submission_';

export default function OfflineDraftSync() {
  const [toast, setToast] = useState('');

  const syncDrafts = useCallback(async () => {
    if (!navigator.onLine) return;

    const keys = Object.keys(localStorage).filter((key) => key.startsWith(offlinePrefix));
    let synced = 0;

    for (const key of keys) {
      try {
        const payload = JSON.parse(localStorage.getItem(key));
        await api.post('/form-submissions', payload);
        localStorage.removeItem(key);
        synced += 1;
      } catch {
        break;
      }
    }

    if (synced) setToast(`${synced} offline drafts synced`);
  }, []);

  useEffect(() => {
    syncDrafts();
    window.addEventListener('online', syncDrafts);
    return () => window.removeEventListener('online', syncDrafts);
  }, [syncDrafts]);

  return <Toast message={toast} type="success" onClose={() => setToast('')} />;
}

export { offlinePrefix };
