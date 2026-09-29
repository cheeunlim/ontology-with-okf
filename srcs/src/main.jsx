/**
 * Copyright (c) 2026 seanjung <seanjung@google.com>. All rights reserved.
 * Licensed under PolyForm Noncommercial License 1.0.0. Commercial use prohibited.
 */

import React, { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import KcSpannerDemoPage from './components/KcSpannerDemoPage.jsx'

/**
 * Resolves the current route mode ('studio' | 'kc-en' | 'kc-kr') from the browser URL.
 */
function resolveRouteMode() {
  const path = window.location.pathname.toLowerCase();
  const search = new URLSearchParams(window.location.search);
  const hash = window.location.hash.toLowerCase();

  if (path === '/ko' || path.startsWith('/ko/') || path.startsWith('/kc-spanner/ko') || search.get('lang') === 'kr' || hash === '#ko') {
    return 'kc-kr';
  }
  if (path.startsWith('/kc-spanner') || search.get('page') === 'kc-spanner' || hash.includes('kc-spanner')) {
    return 'kc-en';
  }
  return 'studio';
}

/**
 * Top-level router switching cleanly between the full OKF Omni Studio and the standalone KC & Spanner showcase page (/kc-spanner and /ko).
 */
function RootRouter() {
  const [routeMode, setRouteMode] = useState(() => resolveRouteMode());

  useEffect(() => {
    const syncRoute = () => setRouteMode(resolveRouteMode());
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    window.addEventListener('okf:navigate', syncRoute);
    return () => {
      window.removeEventListener('popstate', syncRoute);
      window.removeEventListener('hashchange', syncRoute);
      window.removeEventListener('okf:navigate', syncRoute);
    };
  }, []);

  if (routeMode === 'kc-kr' || routeMode === 'kc-en') {
    return (
      <KcSpannerDemoPage
        initialLang={routeMode === 'kc-kr' ? 'kr' : 'en'}
        onBackToStudio={() => {
          window.history.pushState({}, '', '/');
          window.dispatchEvent(new Event('okf:navigate'));
        }}
      />
    );
  }

  return <App />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <RootRouter />
  </StrictMode>,
)

