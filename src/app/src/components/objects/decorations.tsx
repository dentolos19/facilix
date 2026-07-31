import type { ComponentType } from "react";

import type { DecorationItem } from "#/routes/(platform)/facility.$id/-helpers/scene-geometry";

import { Barrel } from "./barrel";
import { Cabinet } from "./cabinet";
import { Chair } from "./chair";
import { ConferenceTable } from "./conference-table";
import { Counter } from "./counter";
import { Crate } from "./crate";
import { Desk } from "./desk";
import { LabBench } from "./lab-bench";
import { Machine } from "./machine";
import { Pallet } from "./pallet";
import { Plant } from "./plant";
import { Rack } from "./rack";
import { ReceptionDesk } from "./reception-desk";
import { SafetyCone } from "./safety-cone";
import { Sofa } from "./sofa";
import { Stool } from "./stool";
import { Table } from "./table";
import { Vehicle } from "./vehicle";
import { WasteBin } from "./waste-bin";

const DECORATION_COMPONENTS: Record<string, ComponentType> = {
  barrel: Barrel,
  cabinet: Cabinet,
  chair: Chair,
  conferenceTable: ConferenceTable,
  counter: Counter,
  crate: Crate,
  desk: Desk,
  labBench: LabBench,
  machine: Machine,
  pallet: Pallet,
  plant: Plant,
  rack: Rack,
  receptionDesk: ReceptionDesk,
  safetyCone: SafetyCone,
  serverRack: () => <Rack server />,
  sofa: Sofa,
  stool: Stool,
  table: Table,
  vehicle: Vehicle,
  wasteBin: WasteBin,
};

function DecorationObject({ item }: { item: DecorationItem }) {
  const ObjectComponent = DECORATION_COMPONENTS[item.kind];
  if (!ObjectComponent) return null;

  return (
    <group
      position={[item.position.x, item.position.y, item.position.z]}
      rotation={[0, item.rotation, 0]}
      scale={item.scale}
    >
      <ObjectComponent />
    </group>
  );
}

export function Decorations({ decorations }: { decorations: DecorationItem[] }) {
  return decorations.map((item, index) => <DecorationObject item={item} key={`${item.kind}-${index}`} />);
}
