import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false,
      staleTime: 30_000, // roster rarely changes mid-event; avoid refetch churn
      retry: 1, // fail fast at the kiosk instead of stalling on a dead backend
    },
  },
});
