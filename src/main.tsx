import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

registerSW({ immediate: true });

// Tier 1 Google Maps Platform Demo Key Quota Defense
(window as unknown as { gm_authFailure?: () => void }).gm_authFailure = () => {
  window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
};

const origError = console.error;
console.error = (...args: unknown[]) => {
  origError.apply(console, args);
  const msg = args.map((a) => String(a)).join(' ');
  if (msg.includes('OverQuotaMapError') || msg.includes('QuotaExceededError')) {
    window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
  } else if (
    msg.includes('ApiNotActivatedMapError') ||
    msg.includes('BillingNotEnabledMapError') ||
    msg.includes('InvalidKeyMapError') ||
    msg.includes('RefererNotAllowedMapError') ||
    msg.includes('ApiProjectMapError')
  ) {
    window.dispatchEvent(new CustomEvent('gmp-map-render-error'));
  }
};

createRoot(document.getElementById('root')!).render(<App />);
