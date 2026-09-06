import { useState } from "react";
import { useSyncState } from "client/store/syncStatus";
import { useLocale, useSetLocale } from "client/i18n/useTranslation";
import { type ListSummary } from "client/store/lists";
import { ShoppingList } from "client/components/ShoppingList";
import { AccountButton } from "client/components/AccountButton";
import { SyncNotice } from "client/components/SyncNotice";
import { LanguageDialog } from "client/components/LanguageDialog";
import { ListPanel } from "client/components/ListPanel";

/**
 * Where the lists are, and what they are doing. `"closed"` and `"pick"` are the same picture above
 * `WIDE`, where the sidebar is always on screen and always pickable; below it `"closed"` means no
 * sheet.
 */
type PanelMode = "closed" | "pick" | "edit";

/**
 * Crossing into the sidebar's territory with the pick sheet open is the one way to ask for two
 * panels at once: the arriving sidebar does that sheet's job, so the sheet goes. Edit mode has no
 * sidebar equivalent and rides the crossing both ways. Exported for its own sake — mounting
 * `ListView` needs a Clerk provider, so this is the part a unit test can reach.
 */
export const nextPanelMode = ({ mode, wide }: { mode: PanelMode; wide: boolean }): PanelMode =>
  wide && mode === "pick" ? "closed" : mode;

/**
 * One list on screen. The lists panel sits outside the keyed `<ShoppingList>`, whose remount is what
 * resets the query, edit mode, the checked fold and the Undo buffer on a switch — and the panel's
 * mode lives here, which is what keeps one panel on screen rather than two.
 */
export const ListView = ({
  listId,
  listName,
  wide,
  onSelectList,
}: {
  listId: string;
  listName: string;
  /**
   * Whether the lists have room to stand beside the list instead of over it. A prop rather than a
   * media query read here: it decides which surface they get, and that is worth asserting.
   */
  wide: boolean;
  onSelectList: (id: string) => void;
}) => {
  const { status, everSynced } = useSyncState();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [langOpen, setLangOpen] = useState(false);
  const [mode, setMode] = useState<PanelMode>("closed");
  const [confirming, setConfirming] = useState<ListSummary | null>(null);

  // Adjusted during render rather than from an Effect: React re-runs this component with the new
  // mode before reconciling its children, so the two panels never commit, where an Effect would
  // paint them together for a frame.
  const panel = nextPanelMode({ mode, wide });
  if (panel !== mode) setMode(panel);

  const blocked = langOpen || confirming !== null;

  return (
    <div
      data-wide={wide || undefined}
      className={`
        min-h-dvh
        data-wide:grid data-wide:grid-cols-[auto_minmax(0,1fr)]
      `}
    >
      {(wide || panel !== "closed") && (
        <ListPanel
          activeId={listId}
          wrapper={wide ? "sidebar" : "sheet"}
          editing={panel === "edit"}
          blocked={blocked}
          confirming={confirming}
          onSelect={onSelectList}
          onEditingChange={(editing) => {
            setMode(editing ? "edit" : "pick");
          }}
          onConfirming={setConfirming}
          onDismiss={() => {
            setMode("closed");
          }}
        />
      )}
      {/* aria-modal only promises the page behind is unreachable; inert is what delivers it */}
      <div
        inert={blocked || (!wide && panel !== "closed")}
        // Uncapped on purpose: the header's background and hairline have to reach this pane's edges
        // at every width, so the column cap lives on the header's bands and on `<main>` instead.
        className="w-full min-w-0"
      >
        <ShoppingList
          key={listId}
          listId={listId}
          listName={listName}
          wide={wide}
          onPickList={() => {
            setMode("pick");
          }}
          // Block gestures only on first connect (its initial sync can reshuffle the list under a
          // finger); later reconnect blips shouldn't make swipe/reorder flap.
          syncing={status === "connecting" && !everSynced}
          headerRight={
            <AccountButton
              status={status}
              onLanguage={() => {
                setLangOpen(true);
              }}
            />
          }
          notice={<SyncNotice status={status} />}
        />
      </div>
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
