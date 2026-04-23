import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'  // Initialize i18next before App renders
import App from './App.tsx'
import './index.css'

const rootElement = document.getElementById("root");
if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html contains a <div id='root'>.");
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>
);
