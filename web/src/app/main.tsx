import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '../shared/styles.css';
import '../shared/i18n';
import { initTelegram } from '../shared/telegram';
import { applyTheme } from '../shared/theme';
import { ToastProvider } from '../shared/ui';
import { BASE_FONTS_CSS, loadFontCss } from '../shared/fonts';
import { App } from './App';

applyTheme();
initTelegram();
void loadFontCss(BASE_FONTS_CSS);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000, refetchOnWindowFocus: false },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter basename="/app">
          <App />
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </React.StrictMode>,
);
