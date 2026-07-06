import { describe, expect, it } from "vitest";
import { cn } from "@/lib/utils";

describe("cn", () => {
  it("joins truthy class names", () => {
    expect(cn("a", "b")).toContain("a");
    expect(cn("a", "b")).toContain("b");
  });

  it("drops falsey values", () => {
    expect(cn("a", false, null, undefined, "c")).toBe("a c");
  });

  it("merges conflicting tailwind classes (last wins)", () => {
    // twMerge collapses conflicting utilities.
    expect(cn("p-2", "p-4")).toBe("p-4");
  });
});
