/**
 * Icons reference symbols in the served `/public/sprite.svg` sprite via `<use>`, so the raw paths
 * ship once as a precached static asset and every icon still inherits `currentColor`.
 */
type IconProps = { className?: string };

const make =
  (id: string) =>
  ({ className }: IconProps) => (
    <svg
      viewBox="0 0 24 24"
      className={className}
      fill="currentColor"
      aria-hidden
      focusable="false"
    >
      <use href={`/sprite.svg#${id}`} />
    </svg>
  );

export const CheckIcon = make("check");
export const GlobeIcon = make("globe");
export const SearchIcon = make("search");
export const DragIcon = make("drag");
export const ExpandIcon = make("expand");
export const ChevronIcon = make("chevron");
export const CloseIcon = make("close");
export const AddIcon = make("add");
export const MinusIcon = make("minus");
export const PersonIcon = make("person");
export const DeleteIcon = make("delete");
