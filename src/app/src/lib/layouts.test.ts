import { describe, expect, test } from "bun:test";

import { parseImportedFacilityLayout } from "#/lib/layouts";
import { fromSnapshot, type PlacedItem, recomputeZoneLinks } from "#/routes/(platform)/facility.$id/-helpers/types";

const zone: PlacedItem = {
  id: "zone",
  type: "Zone",
  x: 0,
  y: 0,
  width: 100,
  height: 100,
  zoneId: null,
  name: "Zone",
  status: "unknown",
  notes: "",
  props: {},
};

const sensor: PlacedItem = {
  ...zone,
  id: "sensor",
  type: "Sensor",
  x: 50,
  y: 50,
  width: 10,
  height: 10,
  zoneId: zone.id,
  name: "Sensor",
};

describe("facility layout imports", () => {
  test("preserves current item IDs and remaps foreign items and their links", () => {
    const [importedZone, importedSensor] = parseImportedFacilityLayout({ items: [zone, sensor] }, [sensor]);

    expect(importedZone.id).not.toBe(zone.id);
    expect(importedSensor.id).toBe(sensor.id);
    expect(importedSensor.zoneId).toBe(importedZone.id);
  });

  test("rejects malformed items and duplicate IDs", () => {
    expect(() => parseImportedFacilityLayout({ items: null }, [])).toThrow();
    expect(() => parseImportedFacilityLayout({ items: [{ ...sensor, props: null }] }, [])).toThrow();
    expect(() => parseImportedFacilityLayout({ items: [sensor, sensor] }, [])).toThrow();
  });

  test("clears device links when the last zone is removed", () => {
    expect(recomputeZoneLinks([sensor])[0].zoneId).toBeNull();
  });

  test("restores the saved layer order", () => {
    const layout = {
      version: 1 as const,
      items: [sensor, zone].map(({ id, x, y, width, height }) => ({ id, x, y, width, height })),
    };
    const result = fromSnapshot(
      layout,
      [{ id: zone.id, name: zone.name, data: zone.props, notes: zone.notes }],
      [
        {
          id: sensor.id,
          name: sensor.name,
          type: sensor.type,
          status: sensor.status,
          data: sensor.props,
          notes: sensor.notes,
          zoneId: sensor.zoneId,
        },
      ],
    );
    expect(result.map((item) => item.id)).toEqual([sensor.id, zone.id]);
  });
});
