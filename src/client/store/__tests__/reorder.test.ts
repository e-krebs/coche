import { describe, expect, it } from "vitest";
import { generateKeyBetween } from "fractional-indexing";
import { keyForPosition, sortedByPosition } from "client/store/reorder";

const a = generateKeyBetween(null, null);
const b = generateKeyBetween(a, null);
const c = generateKeyBetween(b, null);
const pos: Record<string, string> = { A: a, B: b, C: c };
const getPos = (id: string) => pos[id];

describe("keyForPosition", () => {
  describe("when an item is moved to the end", () => {
    it("yields a key after the last neighbour", () => {
      const key = keyForPosition({ order: ["B", "C", "A"], id: "A", getPosition: getPos });
      expect(key! > c).toBe(true);
    });
  });

  describe("when an item is moved to the front", () => {
    it("yields a key before the first neighbour", () => {
      const key = keyForPosition({ order: ["C", "A", "B"], id: "C", getPosition: getPos });
      expect(key! < a).toBe(true);
    });
  });

  describe("when an item is moved between two items", () => {
    it("yields a key strictly between them", () => {
      const key = keyForPosition({ order: ["A", "C", "B"], id: "C", getPosition: getPos });
      expect(key! > a && key! < b).toBe(true);
    });
  });

  describe("when the id is unknown", () => {
    it("returns null", () => {
      expect(keyForPosition({ order: ["A", "B"], id: "Z", getPosition: getPos })).toBeNull();
    });
  });

  describe("when neighbours share a position", () => {
    it("returns null instead of throwing", () => {
      const collided: Record<string, string> = { A: "a0", B: "a0", C: "a1" };
      expect(
        keyForPosition({ order: ["A", "C", "B"], id: "C", getPosition: (id) => collided[id] }),
      ).toBeNull();
    });
  });
});

describe("sortedByPosition", () => {
  describe("when positions are equal", () => {
    it("breaks ties by id, order-independently", () => {
      const tied = () => "a0"; // two rows concurrently minted the same index
      expect(sortedByPosition(["y", "x"], tied)).toEqual(["x", "y"]);
      expect(sortedByPosition(["x", "y"], tied)).toEqual(["x", "y"]);
    });
  });
});
