import { useTranslation } from "client/i18n/useTranslation";

export const UndoSnackbar = ({ name, onUndo }: { name: string; onUndo: () => void }) => {
  const t = useTranslation();
  return (
    <div className="fixed inset-x-0 bottom-4 z-30 flex justify-center px-4">
      <div
        role="status"
        className={`
          animate-snackbar-in flex items-center gap-3 rounded-xl bg-[#323232] py-2.5 pr-2 pl-4
          text-white shadow-lg
        `}
      >
        <span className="min-w-0 truncate text-[14px]">{t("deleted", { name })}</span>
        <button
          type="button"
          onClick={onUndo}
          className={`
            flex-none rounded-lg px-3 py-1.5 text-[14px] font-medium text-accent outline-hidden
            focus-visible:ring-2 focus-visible:ring-accent
          `}
        >
          {t("undo")}
        </button>
      </div>
    </div>
  );
};
