// Top functions of a .cpuprofile by self time and by inclusive time: bun analyze.ts <file> [top]
import { readFileSync } from "node:fs";

type TNode = { id: number; callFrame: { functionName: string; url: string; lineNumber: number }; children?: Array<number> };
const [file, top = "25"] = process.argv.slice(2);
const profile = JSON.parse(readFileSync(file, "utf8")) as { nodes: Array<TNode>; samples: Array<number>; timeDeltas: Array<number> };
const nodes = new Map(profile.nodes.map((node) => [node.id, node]));
const parent = new Map<number, number>();
for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
const name = ({ callFrame }: TNode) =>
  `${callFrame.functionName || "(anonymous)"} ${callFrame.url.replace(/.*node_modules\//, "").replace(/.*ResanoRP\//, "")}:${callFrame.lineNumber}`;
const self = new Map<string, number>();
const inclusive = new Map<string, number>();
let total = 0;
profile.samples.forEach((id, index) => {
  const ms = (profile.timeDeltas[index] ?? 0) / 1000;
  total += ms;
  const node = nodes.get(id)!;
  self.set(name(node), (self.get(name(node)) ?? 0) + ms);
  const seen = new Set<string>();
  for (let current: number | undefined = id; current !== undefined; current = parent.get(current)) {
    const key = name(nodes.get(current)!);
    if (seen.has(key)) continue;
    seen.add(key);
    inclusive.set(key, (inclusive.get(key) ?? 0) + ms);
  }
});
const print = (title: string, map: Map<string, number>) => {
  console.log(`\n${title} (total ${total.toFixed(0)} ms)`);
  for (const [key, ms] of [...map].sort((a, b) => b[1] - a[1]).slice(0, Number(top))) {
    console.log(`${ms.toFixed(0).padStart(7)} ms ${((ms / total) * 100).toFixed(1).padStart(5)}%  ${key.slice(0, 130)}`);
  }
};
print("self", self);
print("inclusive", inclusive);
