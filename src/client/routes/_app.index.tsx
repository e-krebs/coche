import { useState } from "react";
import { Navigate, createFileRoute } from "@tanstack/react-router";
import { readLastList, useLists } from "client/store/lists";

/**
 * `/` resolves to the list this device was last on, else the first. The roster is never empty (a
 * virtual default list stands in), so this always lands somewhere.
 */
const LastUsedList = () => {
  const lists = useLists();
  const [hint] = useState(readLastList);
  const listId = lists.find((l) => l.id === hint)?.id ?? lists[0].id;
  return <Navigate to="/lists/$listId" params={{ listId }} replace />;
};

export const Route = createFileRoute("/_app/")({
  component: LastUsedList,
});
