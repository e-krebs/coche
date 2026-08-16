import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { UserButton } from "@clerk/clerk-react";
import { useIdentity } from "client/store/identity";
import { StoreProvider } from "client/store/StoreProvider";
import { useStore } from "client/store/store";
import { readLastList, useLists, useRosterRepair } from "client/store/lists";
import { useSync } from "client/store/sync";
import { ShoppingList } from "client/components/ShoppingList";
import { SyncStatus } from "client/components/SyncStatus";
import { LanguageDialog } from "client/components/LanguageDialog";
import { CheckIcon, GlobeIcon } from "client/components/icons";
import { useLocale, useSetLocale, useSyncLocale, useTranslation } from "client/i18n/useTranslation";

const Centered = ({ children }: { children: React.ReactNode }) => (
  <div
    className={`
      mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-3 p-6 text-center
      text-muted
    `}
  >
    {children}
  </div>
);

/**
 * useSync owns the WS synchronizer (one call); its status drives the indicator and gesture-gating
 * (a mid-gesture refresh would cancel it).
 */
const ListView = () => {
  const store = useStore();
  const status = useSync(store);
  const locale = useLocale();
  const setLocale = useSetLocale();
  const t = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  // Block gestures only on first connect (its initial sync can reshuffle the list under a finger);
  // later reconnect blips shouldn't make swipe/reorder flap.
  const [everSynced, setEverSynced] = useState(false);
  useSyncLocale();
  useEffect(() => {
    if (status === "synced") setEverSynced(true);
  }, [status]);

  // Local-only has no replica to race, so it never waits for a sync that won't come.
  useRosterRepair({ synced: everSynced || status === "disabled" });
  const lists = useLists();
  const [hint] = useState(readLastList);
  // The roster is never empty — a virtual default list stands in until repair runs.
  const listId = lists.find((l) => l.id === hint)?.id ?? lists[0].id;

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <ShoppingList
        key={listId}
        listId={listId}
        syncing={status === "connecting" && !everSynced}
        headerRight={
          <>
            <SyncStatus status={status} />
            <UserButton>
              <UserButton.MenuItems>
                <UserButton.Action
                  label={t("language")}
                  labelIcon={<GlobeIcon className="size-4" />}
                  onClick={() => {
                    setLangOpen(true);
                  }}
                />
              </UserButton.MenuItems>
            </UserButton>
          </>
        }
      />
      {langOpen && (
        <LanguageDialog
          locale={locale}
          onSelect={(l) => {
            setLocale(l);
            setLangOpen(false);
          }}
          onClose={() => {
            setLangOpen(false);
          }}
        />
      )}
    </div>
  );
};

const Home = () => {
  const { status, userId } = useIdentity();
  // Pre-store screens read the mirror (last chosen locale, else browser); useSyncLocale reconciles
  // the synced value once the list mounts.
  const t = useTranslation();

  if (status === "signed-out") return <Navigate to="/sign-in" />;
  if (status === "loading") return <Centered>{t("loading")}</Centered>;
  if (status === "first-run" || !userId) {
    return (
      <Centered>
        <span className="grid size-14 place-items-center rounded-full bg-accent text-on-accent">
          <CheckIcon className="size-8" />
        </span>
        <h1 className="text-xl font-medium text-ink">{t("connectTitle")}</h1>
        <p className="max-w-[26ch] text-sm">{t("connectBody")}</p>
      </Centered>
    );
  }

  return (
    <StoreProvider key={userId} userId={userId}>
      <ListView />
    </StoreProvider>
  );
};

export const Route = createFileRoute("/")({
  component: Home,
});
