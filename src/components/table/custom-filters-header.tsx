import { use } from "react";

import { CustomFiltersContext } from "@/components/table/custom-filters-context";

export default function CustomFiltersHeader() {
  return <>{use(CustomFiltersContext)}</>;
}
