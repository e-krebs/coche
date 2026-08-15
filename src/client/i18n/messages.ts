/**
 * English is the source of truth for the key set — fr is typed Record<MessageKey, Message>, so a
 * missing or renamed French key is a compile error. A Message is a plain string, or a
 * { one, other } pair picked by `count` and the locale's plural rules (see translate).
 */
export const en = {
  appTitle: "Coche",
  addOrFind: "Add or find an item",
  addOrFindPlaceholder: "Add or find an item…",
  addItem: "Add item",
  clear: "Clear search",
  emptyTitle: "Nothing here yet.",
  emptySub: "Type above to add your first item.",
  allDone: "Nothing to buy — all done.",
  noMatches: "No matches found.",
  checked: "Checked ({count})",
  clearChecked: "Clear checked",
  mark: "Check off {name}",
  rename: "Rename {name}",
  delete: "Delete {name}",
  editQuantity: "Edit quantity of {name}",
  addQuantity: "Add quantity to {name}",
  increaseQuantity: "Increase quantity of {name}",
  decreaseQuantity: "Decrease quantity of {name}",
  closeQuantity: "Close quantity editor for {name}",
  deleted: "Deleted “{name}”",
  undo: "Undo",
  syncLocalOnly: "Local only",
  syncOffline: "Offline",
  syncConnecting: "Syncing…",
  syncSynced: "Synced",
  syncSignedOut: "Signed out",
  loading: "Loading…",
  connectTitle: "Sign in once to get started",
  connectBody: "Sign in once while you're online. After that, your list works fully offline.",
  language: "Language",
} as const;

export type MessageKey = keyof typeof en;

export type Plural = { one: string; other: string };
export type Message = string | Plural;

export const fr: Record<MessageKey, Message> = {
  appTitle: "Coche",
  addOrFind: "Ajouter ou rechercher un article",
  addOrFindPlaceholder: "Ajouter ou rechercher un article…",
  addItem: "Ajouter",
  clear: "Effacer",
  emptyTitle: "Rien pour l’instant.",
  emptySub: "Saisissez un nom ci-dessus pour ajouter votre premier article.",
  allDone: "Rien à acheter — tout est coché.",
  noMatches: "Aucun résultat.",
  checked: { one: "Coché ({count})", other: "Cochés ({count})" },
  clearChecked: "Supprimer les articles cochés",
  mark: "Cocher {name}",
  rename: "Renommer {name}",
  delete: "Supprimer {name}",
  editQuantity: "Modifier la quantité de {name}",
  addQuantity: "Ajouter une quantité à {name}",
  increaseQuantity: "Augmenter la quantité de {name}",
  decreaseQuantity: "Diminuer la quantité de {name}",
  closeQuantity: "Fermer la modification de la quantité de {name}",
  deleted: "« {name} » supprimé",
  undo: "Annuler",
  syncLocalOnly: "Local uniquement",
  syncOffline: "Hors ligne",
  syncConnecting: "Synchronisation…",
  syncSynced: "Synchronisé",
  syncSignedOut: "Déconnecté",
  loading: "Chargement…",
  connectTitle: "Connectez-vous une fois pour commencer",
  connectBody:
    "Connectez-vous une seule fois en ligne. Ensuite, votre liste fonctionne entièrement hors ligne.",
  language: "Langue",
};
