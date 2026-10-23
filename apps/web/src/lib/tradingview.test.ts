import { describe, expect, it } from "vitest";
import { snapshotImage } from "./tradingview";

describe("snapshotImage", () => {
  it("maps snapshot links to their image", () => {
    expect(snapshotImage("https://www.tradingview.com/x/AbC123/")).toBe("https://s3.tradingview.com/snapshots/a/AbC123.png");
    expect(snapshotImage("https://tradingview.com/x/Zz9")).toBe("https://s3.tradingview.com/snapshots/z/Zz9.png");
  });

  it("ignores anything else", () => {
    expect(snapshotImage("https://www.tradingview.com/chart/abc/")).toBeNull();
    expect(snapshotImage("https://evil.example/x/AbC123/")).toBeNull();
    expect(snapshotImage(null)).toBeNull();
  });
});
