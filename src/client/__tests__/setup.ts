import "fake-indexeddb/auto";
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { IDBFactory } from "fake-indexeddb";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

// One global teardown so tests need no per-file beforeEach/afterEach: unmount the tree, drop
// per-test request handlers, wipe the browser stores + IndexedDB, and reset navigator.onLine.
afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  sessionStorage.clear();
  globalThis.indexedDB = new IDBFactory();
  Object.defineProperty(navigator, "onLine", { configurable: true, value: true });
});

afterAll(() => {
  server.close();
});
