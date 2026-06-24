import { create } from 'zustand';

interface ToastState {
  message: string | null;
  /** Show a transient toast; auto-dismisses after `ms`. */
  show: (message: string, ms?: number) => void;
  hide: () => void;
}

let timer: ReturnType<typeof setTimeout> | undefined;

export const useToastStore = create<ToastState>((set) => ({
  message: null,
  show: (message, ms = 2400) => {
    clearTimeout(timer);
    set({ message });
    timer = setTimeout(() => set({ message: null }), ms);
  },
  hide: () => {
    clearTimeout(timer);
    set({ message: null });
  },
}));

/** Imperative helper for non-component callers (hooks, handlers). */
export const toast = (message: string, ms?: number) => useToastStore.getState().show(message, ms);
