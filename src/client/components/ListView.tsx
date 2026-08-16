import { useState } from "react";
import { UserButton } from "@clerk/clerk-react";
import { useSyncState } from "client/store/syncStatus";
import { useLocale, useSetLocale, useTranslation } from "client/i18n/useTranslation";
import { ShoppingList } from "client/components/ShoppingList";
import { SyncStatus } from "client/components/SyncStatus";
import { LanguageDialog } from "client/components/LanguageDialog";
import { ListPicker } from "client/components/ListPicker";
import { GlobeIcon } from "client/components/icons";

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
  const t = useTranslation();
  const [langOpen, setLangOpen] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className="mx-auto min-h-dvh max-w-md">
      <ShoppingList
        key={listId}
        listId={listId}
        listName={listName}
        onPickList={() => {
          setPickerOpen(true);
        }}
        // Block gestures only on first connect (its initial sync can reshuffle the list under a
        // finger); later reconnect blips shouldn't make swipe/reorder flap.
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
          activeId={listId}
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
