import { createContext } from "react";

// The header reads the filters from a context instead of capturing them, so a change in the filters re-renders them
// instead of replacing the header component, which would remount the filters and close their open popovers
export const CustomFiltersContext = createContext<React.ReactNode>(undefined);
