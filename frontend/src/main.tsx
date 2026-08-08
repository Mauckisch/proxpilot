import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import {
  MantineProvider,
  createTheme,
} from '@mantine/core';
import { Notifications } from '@mantine/notifications';
import {
  QueryClient,
  QueryClientProvider,
} from '@tanstack/react-query';

import '@mantine/core/styles.css';
import '@mantine/dates/styles.css';
import '@mantine/notifications/styles.css';
import './index.css';

import { AuthGate } from './components/AuthGate';

const theme = createTheme({
  primaryColor: 'blue',
  defaultRadius: 'md',
  fontFamily:
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
});

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

const rootElement =
  document.getElementById('root');

if (!rootElement) {
  throw new Error(
    'Root element was not found.',
  );
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider
      client={queryClient}
    >
      <MantineProvider
        theme={theme}
        defaultColorScheme="dark"
      >
        <Notifications position="top-right" />
        <AuthGate />
      </MantineProvider>
    </QueryClientProvider>
  </StrictMode>,
);
