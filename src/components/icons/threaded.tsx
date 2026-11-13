import { createLucideIcon } from "lucide-react";

const ThreadedIcon = createLucideIcon("threaded", [
  ["path", { d: "m5 7 14-2", key: "thread-1" }],
  ["path", { d: "m5 11 14-2", key: "thread-2" }],
  ["path", { d: "m5 15 14-2", key: "thread-3" }],
  ["path", { d: "m5 19 14-2", key: "thread-4" }],
  ["rect", { x: "7", y: "2", width: "10", height: "20", rx: "1", key: "bar" }],
]);

export default ThreadedIcon;
