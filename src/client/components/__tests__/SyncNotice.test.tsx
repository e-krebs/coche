import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { SyncNotice } from "client/components/SyncNotice";
import type { SyncStatus as Status } from "client/store/sync";

// The sign-in affordance is a router <Link>, so the notice needs a router — a memory one with a stub
// route tree keeps this a component test rather than a route test.
const setup = async ({ status }: { status: Status }) => {
  const rootRoute = createRootRoute({ component: () => <SyncNotice status={status} /> });
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([signIn]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The provider paints nothing until the router has loaded its first match.
  await router.load();
  render(<RouterProvider router={router} />);
};

const ui = {
  queryNotice: () => screen.queryByText(/offline|signed out/i),
  notice: (content: string) => screen.getByText(content),
  querySignIn: () => screen.queryByRole("link", { name: "Sign in" }),
};

describe("SyncNotice", () => {
  it("names the offline state, where the list stays writable", async () => {
    await setup({ status: "offline" });
    expect(ui.notice("Offline — changes are saved on this device")).toBeInTheDocument();
  });

  it("names the signed-out state and offers the way back", async () => {
    await setup({ status: "signin-required" });
    expect(ui.notice("Signed out — this list isn’t syncing")).toBeInTheDocument();
    expect(ui.querySignIn()).toHaveAttribute("href", "/sign-in");
  });

  // Quiet states are the badge's job: a strip for "synced" would be a permanent interruption saying
  // nothing needs doing.
  it("stays silent for the states that need no response", async () => {
    await setup({ status: "synced" });
    expect(ui.queryNotice()).toBeNull();
  });

  it("stays silent while connecting", async () => {
    await setup({ status: "connecting" });
    expect(ui.queryNotice()).toBeNull();
  });

  it("stays silent when sync is off for the whole deployment", async () => {
    await setup({ status: "disabled" });
    expect(ui.queryNotice()).toBeNull();
  });

  it("offers sign-in only when signed out", async () => {
    await setup({ status: "offline" });
    expect(ui.querySignIn()).toBeNull();
  });
});
