import { describe, expect, it } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { useState } from "react";
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
// route tree keeps this a component test rather than a route test. The status is held in state so a
// test can watch the strip react to sync recovering, as it does in the app.
const setup = async ({ status }: { status: Status }) => {
  let publish: (next: Status) => void = () => {};
  const Harness = () => {
    const [current, setCurrent] = useState(status);
    publish = setCurrent;
    return <SyncNotice status={current} />;
  };
  const rootRoute = createRootRoute({ component: Harness });
  const signIn = createRoute({ getParentRoute: () => rootRoute, path: "/sign-in" });
  const router = createRouter({
    routeTree: rootRoute.addChildren([signIn]),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  // The provider paints nothing until the router has loaded its first match.
  await router.load();
  render(<RouterProvider router={router} />);
  return {
    setStatus: (next: Status) => {
      act(() => {
        publish(next);
      });
    },
  };
};

// Stand-in for the header title button, the restore target the app always has — same helper as
// LanguageDialog.test.tsx.
const trigger = () => {
  document.querySelectorAll("[data-list-trigger]").forEach((el) => {
    el.remove();
  });
  const el = document.createElement("button");
  el.dataset.listTrigger = "";
  document.body.append(el);
  return el;
};

/** Somewhere focus can legitimately be, distinct from the fallback so a wrong rescue shows up. */
const otherControl = () => {
  const el = document.createElement("button");
  document.body.append(el);
  return el;
};

const ui = {
  queryNotice: () => screen.queryByText(/offline|signed out/i),
  notice: (content: string) => screen.getByText(content),
  signIn: () => screen.getByRole("link", { name: "Sign in" }),
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

  describe("when the sign-in link vanishes from under the reader", () => {
    // Losing the focused link to `<body>` restarts tab order at the top of the document.
    it("hands focus to the header trigger", async () => {
      const fallback = trigger();
      const { setStatus } = await setup({ status: "signin-required" });
      ui.signIn().focus();

      setStatus("synced");

      await waitFor(() => {
        expect(fallback).toHaveFocus();
      });
    });

    // The strip survives this one and only the link is removed — a different reconciliation path
    // from the status going quiet, and the reason the link is its own component.
    it("hands focus back when only the link goes, not the strip", async () => {
      const fallback = trigger();
      const { setStatus } = await setup({ status: "signin-required" });
      ui.signIn().focus();

      setStatus("offline");

      expect(ui.notice("Offline — changes are saved on this device")).toBeInTheDocument();
      await waitFor(() => {
        expect(fallback).toHaveFocus();
      });
    });

    it("leaves focus alone when the reader had moved on", async () => {
      trigger();
      const elsewhere = otherControl();
      const { setStatus } = await setup({ status: "signin-required" });
      ui.signIn().focus();
      expect(ui.signIn()).toHaveFocus(); // or this proves nothing about the rescue not firing
      elsewhere.focus();

      setStatus("synced");

      // Past the frame the rescue would have used: focus never dropped, so nothing to reclaim.
      await act(async () => {
        await new Promise(requestAnimationFrame);
      });
      expect(elsewhere).toHaveFocus();
    });
  });
});
