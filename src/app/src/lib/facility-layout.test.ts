import { describe, expect, test } from "bun:test";

import { FACILITY_LAYOUT_FORMAT, parseGeneratedFacilityLayout } from "./facility-layout";

describe("parseGeneratedFacilityLayout", () => {
  test("normalizes model JSON and remaps zone references", () => {
    const result = parseGeneratedFacilityLayout(
      {
        facilityName: "Warehouse",
        items: [
          { id: "zone-a", type: "Zone", name: "Loading", x: -20, y: 10, width: 300, height: 200 },
          { id: "camera-a", type: "CCTV", name: "Entry camera", x: 50, y: 50, zoneId: "zone-a" },
        ],
      },
      { width: 800, height: 600 },
    );

    expect(result.format).toBe(FACILITY_LAYOUT_FORMAT);
    expect(result.items).toHaveLength(2);
    expect(result.items[0]?.x).toBe(0);
    expect(result.items[1]?.zoneId).toBe(result.items[0]?.id);
    expect(result.items[1]?.props.videoSource).toBe("simulation");
  });

  test("rejects responses without usable facility items", () => {
    expect(() => parseGeneratedFacilityLayout({ items: [{ type: "Door" }] }, { width: 800, height: 600 })).toThrow(
      "could not identify",
    );
  });
});
