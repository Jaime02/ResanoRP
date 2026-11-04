import React from "react";

import { cn } from "@/lib/utils";

interface HeaderProps {
  level?: 1 | 2 | 3 | 4;
  children?: React.ReactNode;
  className?: string;
}

export default function Header({ level = 1, children, className }: HeaderProps) {
  const baseStyles = "font-bold flex flex-row gap-1 items-center";

  const levelStyles = {
    1: "text-2xl lg:text-2xl",
    2: "text-xl lg:text-2xl",
    3: "text-lg lg:text-xl",
    4: "text-lg lg:text-xl",
  };

  const Tag = `h${level}`;
  const styles = cn(baseStyles, levelStyles[level], className);

  return React.createElement(Tag, { className: styles }, children);
}
