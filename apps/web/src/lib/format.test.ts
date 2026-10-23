import { describe, expect, it } from "vitest";
import { fromLocalInput, move, signedMoney, size, toLocalInput } from "./format";

describe("format", () => {
  it("signs money explicitly", () => {
    expect(signedMoney(12.5)).toBe("+$12.50");
    expect(signedMoney(-3)).toBe("−$3.00");
    expect(signedMoney(0)).toBe("$0.00");
  });

  it("shows size and moves in each instrument's units", () => {
    expect(size("EURUSD", 0.5)).toBe("0.50");
    expect(size("MNQZ6", 2)).toBe("2 ct");
    expect(move("EURUSD", 12.34)).toBe("+12.3 pips");
    expect(move("NAS100", -45)).toBe("−45.0 pts");
    expect(move("ES", null)).toBe("–");
  });

  it("round-trips datetime-local values through a time zone", () => {
    const iso = "2026-10-01T05:30:00.000Z";
    expect(toLocalInput(iso, "Africa/Nairobi")).toBe("2026-10-01T08:30");
    expect(fromLocalInput("2026-10-01T08:30", "Africa/Nairobi")).toBe(iso);
    expect(fromLocalInput("", "Africa/Nairobi")).toBeNull();
  });
});
