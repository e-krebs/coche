import { useEffect } from "react";
import { Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { useLists, writeLastList } from "client/store/lists";
import { useTranslation } from "client/i18n/useTranslation";
import { ListView } from "client/components/ListView";
import { WIDE, useMediaQuery } from "client/components/media";

const ListRoute = () => {
  const { listId } = Route.useParams();
  const navigate = useNavigate();
  const t = useTranslation();
  const lists = useLists();
  // One source for both halves of the switch, so the sidebar and the title can't disagree about who
  // owns picking. `useSyncExternalStore` has the answer on the first render, so there is no
  // phone-shaped flash to hide with a CSS-only sidebar — and at phone width the sidebar is then
  // genuinely absent from the DOM rather than merely hidden. Read here rather than in `ListView`, so
  // the component deciding which surface the lists get takes the width as a prop and keeps both of
  // its branches reachable under jsdom.
  const wide = useMediaQuery(WIDE);
  const active = lists.find((l) => l.id === listId);
  const activeId = active?.id;

  // Mirror the URL into the device-local hint so `/` reopens this list. Synchronizing an external
  // system (localStorage), the sanctioned Effect use and the same seam as the identity cache — a
  // deep link has no switch handler to hang this off.
  // https://react.dev/learn/synchronizing-with-effects
  // oxlint-disable react-you-might-not-need-an-effect/no-event-handler
  useEffect(() => {
    if (activeId) writeLastList(activeId);
  }, [activeId]);
  // oxlint-enable react-you-might-not-need-an-effect/no-event-handler

  // A hand-typed id, or a list a peer deleted while we stood on it.
  if (!active) return <Navigate to="/lists/$listId" params={{ listId: lists[0].id }} replace />;

  return (
    <ListView
      listId={active.id}
      listName={active.name ?? t("appTitle")}
      wide={wide}
      onSelectList={(id) => {
        window.scrollTo(0, 0); // the outgoing list's offset means nothing on the new one
        // replace, not push: Back should leave the app, not walk back through a switch history.
        void navigate({ to: "/lists/$listId", params: { listId: id }, replace: true });
      }}
    />
  );
};

export const Route = createFileRoute("/_app/lists/$listId")({
  component: ListRoute,
});
