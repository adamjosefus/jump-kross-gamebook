import { toast, type ExternalToast } from 'sonner';

/** Class of the player's toasts, sized as the story text (index.css); the admin keeps the small ones. */
export const PLAYER_TOAST = 'player-toast';

const options = (extra?: ExternalToast): ExternalToast => ({
  ...extra,
  className: [PLAYER_TOAST, extra?.className].filter(Boolean).join(' '),
});

/** Toasts of the player screens. */
export const playerToast = {
  success: (message: string, extra?: ExternalToast) => toast.success(message, options(extra)),
  info: (message: string, extra?: ExternalToast) => toast.info(message, options(extra)),
  warning: (message: string, extra?: ExternalToast) => toast.warning(message, options(extra)),
  error: (message: string, extra?: ExternalToast) => toast.error(message, options(extra)),
};
