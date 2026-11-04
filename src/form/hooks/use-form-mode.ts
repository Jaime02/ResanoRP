import { useState } from "react";

import { FormMode } from "@/types";

interface UseFormModeProps {
  create?: boolean;
  edit?: boolean;
}

export default function useFormMode({ create, edit }: UseFormModeProps) {
  const [lastFormMode, setLastFormMode] = useState(FormMode.ReadOnly);

  const requestedFormMode = create === true ? FormMode.Create : edit === true ? FormMode.Update : FormMode.ReadOnly;

  /* While the source of truth (the url search params) is being cleared the requested mode falls back to
     ReadOnly, which would flip the form contents before the dialog finishes closing.
     Keep serving the last known mode instead until a new one is requested. */
  if (requestedFormMode === FormMode.ReadOnly) return lastFormMode;

  if (requestedFormMode !== lastFormMode) setLastFormMode(requestedFormMode);

  return requestedFormMode;
}
