import { type SyncStatus as Status } from "client/store/sync";
import { type MessageKey } from "client/i18n";
import { useTranslation } from "client/i18n/useTranslation";

const LABEL: Record<Status, MessageKey> = {
  disabled: "syncLocalOnly",
  offline: "syncOffline",
  connecting: "syncConnecting",
  synced: "syncSynced",
  "signin-required": "syncSignedOut",
};

export const SyncStatus = ({ status }: { status: Status }) => {
  const t = useTranslation();
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted" aria-live="polite">
      <span
        data-status={status}
        className={`
          data-[status=connecting]:animate-bounce-sync
          inline-block size-2 rounded-full
          data-[status=connecting]:bg-syncing
          data-[status=disabled]:border data-[status=disabled]:border-faint
          data-[status=offline]:bg-faint
          data-[status=signin-required]:bg-signin
          data-[status=synced]:bg-synced
        `}
        aria-hidden
      />
      {t(LABEL[status])}
    </span>
  );
};
