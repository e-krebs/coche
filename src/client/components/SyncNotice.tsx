import { Link } from "@tanstack/react-router";
import { type SyncStatus as Status } from "client/store/sync";
import { type MessageKey } from "client/i18n";
import { useTranslation } from "client/i18n/useTranslation";

/**
 * The two states worth interrupting for. The rest are a dot on the avatar: a 10px badge is the wrong
 * instrument for something the reader has to act on, and hover is no answer on a phone.
 */
const NOTICE: Partial<Record<Status, MessageKey>> = {
  offline: "syncOfflineNotice",
  "signin-required": "syncSignedOutNotice",
};

/** The header strip for a sync state the reader has to answer; silent for the rest. */
export const SyncNotice = ({ status }: { status: Status }) => {
  const t = useTranslation();
  const message = NOTICE[status];
  if (!message) return null;

  return (
    <p
      data-status={status}
      className={`
        flex items-center gap-2.5 py-2 text-[13px] text-ink
        before:size-2 before:flex-none before:rounded-full before:content-['']
        data-[status=offline]:before:bg-faint
        data-[status=signin-required]:before:bg-signin
      `}
    >
      {t(message)}
      {status === "signin-required" && (
        <Link
          to="/sign-in"
          className={`
            ml-auto rounded-md px-1 font-medium text-accent-text outline-hidden
            focus-visible:ring-2 focus-visible:ring-accent-text
          `}
        >
          {t("signIn")}
        </Link>
      )}
    </p>
  );
};
