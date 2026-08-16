import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SyncStatus } from "client/components/SyncStatus";
import type { SyncStatus as Status } from "client/store/sync";

const setup = ({ status }: { status: Status }) => {
  render(<SyncStatus status={status} />);
};

const ui = {
  text: (content: string) => screen.getByText(content),
  /** The whole pill, reached from its label — it has no role of its own by design. */
  pill: (content: string) => {
    const el = ui.text(content).closest("span");
    if (!el) throw new Error(`No pill for "${content}"`);
    return el;
  },
};

describe("SyncStatus", () => {
  it("labels the local-only state", () => {
    setup({ status: "disabled" });
    expect(ui.text("Local only")).toBeInTheDocument();
  });

  it("labels the offline state", () => {
    setup({ status: "offline" });
    expect(ui.text("Offline")).toBeInTheDocument();
  });

  it("labels the connecting state", () => {
    setup({ status: "connecting" });
    expect(ui.text("Syncing…")).toBeInTheDocument();
  });

  it("labels the synced state", () => {
    setup({ status: "synced" });
    expect(ui.text("Synced")).toBeInTheDocument();
  });

  it("labels the signed-out state", () => {
    setup({ status: "signin-required" });
    expect(ui.text("Signed out")).toBeInTheDocument();
  });

  // Deliberately not a live region: the status flips on every socket reconnect, so announcing it is
  // chatter rather than an affordance. Pinned here so it can't creep back unnoticed.
  it("does not announce itself", () => {
    setup({ status: "synced" });
    expect(ui.pill("Synced")).not.toHaveAttribute("aria-live");
    expect(ui.pill("Synced")).not.toHaveAttribute("role");
  });

  it("hides the status dot from assistive tech, leaving the label to carry the state", () => {
    setup({ status: "offline" });
    expect(ui.pill("Offline").querySelector("[aria-hidden]")).toBeInTheDocument();
  });
});
