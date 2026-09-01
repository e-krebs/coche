import { UserButton, useUser } from "@clerk/clerk-react";
import { type SyncStatus as Status } from "client/store/sync";
import { useTranslation } from "client/i18n/useTranslation";
import { SyncStatus } from "client/components/SyncStatus";
import { GlobeIcon, PersonIcon } from "client/components/icons";

/**
 * The size must stay the seat's own below: a smaller avatar leaves the dashed placeholder peeking.
 * The fade-in is a keyframe, not a transition: Clerk mounts this box only once its user resolves, so
 * there is no from-state to transition out of.
 */
const AVATAR_BOX = "size-7 animate-avatar-in";

/**
 * Holds the avatar's seat from the first paint: Clerk renders nothing until its user data resolves,
 * and an elastic slot here is what used to shove the centred list title on every cold load. The
 * placeholder overlays Clerk (so it can fade away rather than be covered) and is
 * `pointer-events-none`, so taps reach Clerk's button throughout. The two cross-fade over the same
 * 250ms — the avatar rising as the placeholder drops — because an avatar landing at full opacity
 * over a still-visible glyph reads as a broken layer through any alpha in the photo.
 */
export const AccountButton = ({
  status,
  onLanguage,
}: {
  status: Status;
  onLanguage: () => void;
}) => {
  const { isLoaded } = useUser();
  const t = useTranslation();

  return (
    // A div, not a span: Clerk mounts its button into a <div>, which a span can't legally hold.
    <div className="group/account relative size-7">
      <UserButton appearance={{ elements: { userButtonAvatarBox: AVATAR_BOX } }}>
        <UserButton.MenuItems>
          <UserButton.Action
            label={t("language")}
            labelIcon={<GlobeIcon className="size-4" />}
            onClick={onLanguage}
          />
        </UserButton.MenuItems>
      </UserButton>
      <span
        data-loaded={isLoaded || undefined}
        aria-hidden
        className={`
          pointer-events-none absolute inset-0 grid place-items-center overflow-hidden rounded-full
          border-[1.5px] border-dashed border-faint transition-opacity duration-250 ease-out
          data-loaded:opacity-0
          motion-reduce:transition-none
        `}
      >
        <PersonIcon className="size-5 translate-y-px text-faint/60" />
      </span>
      <SyncStatus status={status} />
    </div>
  );
};
