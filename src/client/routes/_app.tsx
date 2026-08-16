import { useEffect, useState, type ReactNode } from "react";
import { Navigate, Outlet, createFileRoute } from "@tanstack/react-router";
import { useIdentity } from "client/store/identity";
import { StoreProvider } from "client/store/StoreProvider";
import { useStore } from "client/store/store";
import { useRosterRepair } from "client/store/lists";
import { useSync } from "client/store/sync";
import { SyncStateProvider } from "client/store/syncStatus";
import { CheckIcon } from "client/components/icons";
import { useSyncLocale, useTranslation } from "client/i18n/useTranslation";

const Centered = ({ children }: { children: ReactNode }) => (
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
 * The store's long-lived machinery — one WebSocket synchronizer, one roster-repair subscription —
 * mounted above the `$listId` boundary so switching lists never restarts either.
 */
const SyncedShell = () => {
  const store = useStore();
  const status = useSync(store);
  const [everSynced, setEverSynced] = useState(false);
  useSyncLocale();
  useEffect(() => {
    if (status === "synced") setEverSynced(true);
  }, [status]);
  // Local-only has no replica to race, so it never waits for a sync that won't come.
  useRosterRepair({ synced: everSynced || status === "disabled" });

  return (
    <SyncStateProvider value={{ status, everSynced }}>
      <Outlet />
    </SyncStateProvider>
  );
};

const AppLayout = () => {
  const { status, userId } = useIdentity();
  // Pre-store screens read the mirror (last chosen locale, else browser); useSyncLocale reconciles
  // the synced value once the store mounts.
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
      <SyncedShell />
    </StoreProvider>
  );
};

export const Route = createFileRoute("/_app")({
  component: AppLayout,
});
