import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import ErrorBoundary from './components/ErrorBoundary.jsx';
import './styles/global.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

// Offline reading (see public/sw.js for what is and isn't cached).
//
// Registered after load so it never competes with the first render for
// bandwidth, and only over https or on localhost — browsers refuse service
// workers on other insecure origins, and the resulting console error looks
// like a bug when it's just the platform's rule.
if ('serviceWorker' in navigator
  && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      // Registration can fail behind strict privacy settings. The app works
      // exactly as before without it, so there is nothing to tell the user.
    });
  });
}
