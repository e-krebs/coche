import { Link } from "@tanstack/react-router";
import { type SyncStatus as Status } from "client/store/sync";
import { useVanishingFocus } from "client/components/focus";
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

/**
 * Its own component so that the *link* unmounting is what triggers the focus rescue: the strip
 * itself stays mounted across every status, rendering nothing for the quiet ones.
 */
const SignInLink = () => {
  const t = useTranslation();
  const rescue = useVanishingFocus<HTMLAnchorElement>({ fallbackSelector: "[data-list-trigger]" });

  return (
    <Link
      to="/sign-in"
      ref={rescue}
      className={`
        ml-auto rounded-md px-1 font-medium text-accent-text outline-hidden
        focus-visible:ring-2 focus-visible:ring-accent-text
      `}
    >
      {t("signIn")}
    </Link>
  );
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
      {status === "signin-required" && <SignInLink />}
    </p>
  );
};
