import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncStatus } from "client/components/SyncStatus";
import type { SyncStatus as Status } from "client/store/sync";

const setup = ({ status }: { status: Status }) => {
  const { container } = render(<SyncStatus status={status} />);
  return { container };
};

const ui = {
  /** The only copy exposed to assistive tech — the badge and the hover pill are both decorative. */
  label: (content: string) => screen.getByText(content, { selector: ".sr-only" }),
  badge: (container: HTMLElement) => container.querySelector("[data-status]"),
  /** Hidden until the account wrapper is hovered or focused, so it has no role to be found by. */
  pill: (container: HTMLElement) => container.querySelector("[data-sync-pill]"),
  queryLiveRegion: (container: HTMLElement) => container.querySelector("[aria-live]"),
};

describe("SyncStatus", () => {
  it("labels the local-only state", () => {
    setup({ status: "disabled" });
    expect(ui.label("Local only")).toBeInTheDocument();
  });

  it("labels the offline state", () => {
    setup({ status: "offline" });
    expect(ui.label("Offline")).toBeInTheDocument();
  });

  it("labels the connecting state", () => {
    setup({ status: "connecting" });
    expect(ui.label("Syncing…")).toBeInTheDocument();
  });

  it("labels the synced state", () => {
    setup({ status: "synced" });
    expect(ui.label("Synced")).toBeInTheDocument();
  });

  it("labels the signed-out state", () => {
    setup({ status: "signin-required" });
    expect(ui.label("Signed out")).toBeInTheDocument();
  });

  // The badge conveys the state by fill and shape; the variants keyed off this attribute are what
  // make local-only a ring rather than a second grey dot.
  it("carries the state on the badge for styling to key off", () => {
    const { container } = setup({ status: "disabled" });
    expect(ui.badge(container)).toHaveAttribute("data-status", "disabled");
  });

  // Deliberately not a live region: the status flips on every socket reconnect, so announcing it is
  // chatter rather than an affordance. Pinned here so it can't creep back unnoticed.
  it("does not announce itself", () => {
    const { container } = setup({ status: "synced" });
    expect(ui.label("Synced")).not.toHaveAttribute("aria-live");
    expect(ui.label("Synced")).not.toHaveAttribute("role");
    expect(ui.queryLiveRegion(container)).toBeNull();
  });

  it("hides the badge and the hover pill from assistive tech, leaving the label to carry the state", () => {
    const { container } = setup({ status: "offline" });
    expect(ui.badge(container)).toHaveAttribute("aria-hidden");
    expect(ui.pill(container)).toHaveAttribute("aria-hidden");
  });
});
