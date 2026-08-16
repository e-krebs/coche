import { useEffect, useState } from "react";
import { createFileRoute, Navigate } from "@tanstack/react-router";
import { UserButton } from "@clerk/clerk-react";
import { useIdentity } from "client/store/identity";
import { StoreProvider } from "client/store/StoreProvider";
import { useStore } from "client/store/store";
import { readLastList, useLists, useRosterRepair, writeLastList } from "client/store/lists";
import { useSync } from "client/store/sync";
import { ShoppingList } from "client/components/ShoppingList";
import { SyncStatus } from "client/components/SyncStatus";
import { LanguageDialog } from "client/components/LanguageDialog";
import { ListPicker } from "client/components/ListPicker";
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
  const [chosen, setChosen] = useState(readLastList);
  const [pickerOpen, setPickerOpen] = useState(false);
  // The roster has the last word: it is never empty (a virtual default list stands in), and the
  // chosen list can be deleted from another device.
  const active = lists.find((l) => l.id === chosen) ?? lists[0];
  const selectList = (id: string) => {
    setChosen(id);
    writeLastList(id);
    window.scrollTo(0, 0); // the outgoing list's offset means nothing on the new one
  };

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <ShoppingList
        key={active.id}
        listId={active.id}
        listName={active.name ?? t("appTitle")}
        onPickList={() => {
          setPickerOpen(true);
        }}
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
      {pickerOpen && (
        <ListPicker
          activeId={active.id}
          onSelect={selectList}
          onClose={() => {
            setPickerOpen(false);
          }}
        />
      )}
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
