import { createRoot } from 'react-dom/client';
import App from './App';
import { AppProvider } from './context/AppContext';
import './index.css';

// Initialize i18n
import './i18n';

// Ensure the root element exists
const rootElement = document.getElementById('root');

if (!rootElement) {
  throw new Error('Failed to find the root element. Make sure your HTML has a <div id="root"></div>');
}

// Create and render the React app
const root = createRoot(rootElement);

root.render(
  <AppProvider>
    <App />
  </AppProvider>
);

// Optional: Add performance monitoring
// Fix: Add a null check for import.meta.env to prevent crashes in environments where it might be undefined.
if ((import.meta as any).env && (import.meta as any).env.DEV) {
  console.log('🎬 TMS Clip Analyzer - Development Mode');
  console.log('Available Analysis Modes:');
  console.log('  1. Synopsis Generation');
  console.log('  2. Talent Bio Generation');
  console.log('  3. Graphics & Lower Thirds Detection');
  console.log('  4. Fauna Identification');
  console.log('  5. Audio/Video Transcription');
  console.log('  6. Shot List Generation');
}

// Handle unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
});
