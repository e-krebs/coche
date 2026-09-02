import { useState } from "react";
import { useSyncState } from "client/store/syncStatus";
import { useLocale, useSetLocale } from "client/i18n/useTranslation";
import { ShoppingList } from "client/components/ShoppingList";
import { AccountButton } from "client/components/AccountButton";
import { SyncNotice } from "client/components/SyncNotice";
import { LanguageDialog } from "client/components/LanguageDialog";
import { ListPicker } from "client/components/ListPicker";
import { ListSidebar } from "client/components/ListSidebar";
import { WIDE, useMediaQuery } from "client/components/media";

/**
 * One list on screen. The picker sits outside the keyed `<ShoppingList>`, whose remount is what
 * resets the query, edit mode, the checked fold and the Undo buffer on a switch.
 */
export const ListView = ({
  listId,
  listName,
  onSelectList,
}: {
  listId: string;
  listName: string;
  onSelectList: (id: string) => void;
}) => {
  const { status, everSynced } = useSyncState();
  const locale = useLocale();
  const setLocale = useSetLocale();
  const [langOpen, setLangOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerEditing, setPickerEditing] = useState(false);
  // One source for both halves of the switch, so the sidebar and the title can't disagree about who
  // owns picking. `useSyncExternalStore` has the answer on the first render, so there is no
  // phone-shaped flash to hide with a CSS-only sidebar — and at phone width the roster is then
  // genuinely absent from the DOM rather than merely hidden.
  const wide = useMediaQuery(WIDE);

  const openPicker = (editing: boolean) => {
    setPickerEditing(editing);
    setPickerOpen(true);
  };

  return (
    <div
      data-wide={wide || undefined}
      className={`
        min-h-dvh
        data-wide:grid data-wide:grid-cols-[17rem_minmax(0,1fr)]
      `}
    >
      {wide && (
        <div inert={pickerOpen || langOpen}>
          <ListSidebar
            activeId={listId}
            onSelect={onSelectList}
            onEdit={() => {
              openPicker(true);
            }}
          />
        </div>
      )}
      {/* aria-modal only promises the page behind is unreachable; inert is what delivers it */}
      <div
        inert={pickerOpen || langOpen}
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
            openPicker(false);
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
      {pickerOpen && (
        <ListPicker
          activeId={listId}
          initialEditing={pickerEditing}
          onSelect={onSelectList}
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
