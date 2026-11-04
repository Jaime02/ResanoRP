import { createLucideIcon } from "lucide-react";

const TubeIcon = createLucideIcon("tube", [
  ["circle", { cx: "12", cy: "12", r: "10", key: "outer" }],
  ["circle", { cx: "12", cy: "12", r: "5", key: "inner" }],
]);

export default TubeIcon;
