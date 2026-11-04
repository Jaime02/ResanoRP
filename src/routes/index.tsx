import { createFileRoute } from "@tanstack/react-router";

import NavigationGrid from "@/components/home/NavigationGrid";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return <NavigationGrid />;
}
