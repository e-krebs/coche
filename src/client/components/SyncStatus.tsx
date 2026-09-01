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

/**
 * A badge on the account avatar, not a labelled pill: the label's width used to shove the centred
 * list title on every reconnect. Mount inside a `relative` `group/account` — the badge pins to that
 * box's corner and the pill answers its hover/focus.
 */
export const SyncStatus = ({ status }: { status: Status }) => {
  const t = useTranslation();
  const label = t(LABEL[status]);
  return (
    // No aria-live: the status flips on every socket reconnect, so a polite region here is a chatter
    // source rather than an affordance. The sr-only label carries it instead.
    <>
      <span
        data-status={status}
        aria-hidden
        className={`
          data-[status=connecting]:animate-pulse-sync
          absolute -right-px -bottom-px size-2.5 rounded-full ring-2 ring-header
          data-[status=connecting]:bg-syncing
          data-[status=disabled]:bg-header data-[status=disabled]:inset-ring-2
          data-[status=disabled]:inset-ring-muted
          data-[status=offline]:bg-faint
          data-[status=signin-required]:bg-signin
          data-[status=synced]:bg-synced
        `}
      />
      <span className="sr-only">{label}</span>
      {/* Out of flow by design — revealing it must never resize a header column. */}
      <span
        data-sync-pill
        aria-hidden
        className={`
          pointer-events-none absolute top-[calc(100%+0.375rem)] right-0 z-10 rounded-md bg-ink px-2
          py-1 text-[11px] leading-none whitespace-nowrap text-header opacity-0 transition-opacity
          duration-150 ease-out
          group-focus-within/account:opacity-100
          group-hover/account:opacity-100
          motion-reduce:transition-none
        `}
      >
        {label}
      </span>
    </>
  );
};
