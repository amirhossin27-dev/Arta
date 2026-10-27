import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { startCalendarFeed } from './lib/calendarFeed';
import { startLive } from './lib/live';
import { startNotify } from './lib/notify';
import { startPhotos } from './lib/photoSync';
import './styles.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// Echtzeit-Sync mit dem Partner-Handy (falls eingerichtet), Mitteilungen aufs Handy und gemeinsame Fotos.
startLive();
startNotify();
startPhotos();
// Gemeinsame Termine fürs Kalender-Abo im iPhone-Kalender bereitlegen.
startCalendarFeed();

// Offline-Fähigkeit: Service Worker nur im Produktions-Build registrieren.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // Ohne Service Worker läuft die App trotzdem.
    });
  });
}
