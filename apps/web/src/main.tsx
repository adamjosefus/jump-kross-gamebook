import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ThemeProvider } from '@/lib/theme';

import { router } from './router';

import './index.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, refetchOnWindowFocus: true },
  },
});

// Toasts stay below the notch and clear of rounded corners.
const TOAST_OFFSET = {
  top: 'calc(var(--safe-area-inset-top) + 1rem)',
  left: 'calc(var(--safe-area-inset-left) + 1rem)',
  right: 'calc(var(--safe-area-inset-right) + 1rem)',
} as const;

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <RouterProvider router={router} />
          <Toaster position='top-center' offset={TOAST_OFFSET} mobileOffset={TOAST_OFFSET} />
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
);
