import { createRouter as createTanStackRouter, Link } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const router = createTanStackRouter({
    routeTree,
    // ShoppingList restores scroll manually once rows render; the router's own restoration runs too
    // early and lands at the top.
    scrollRestoration: false,
    notFoundMode: "fuzzy",
    defaultNotFoundComponent: () => {
      return (
        <div>
          <p>Not found!</p>
          <Link to="/">Go home</Link>
        </div>
      );
    },
  });

  return router;
};

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
