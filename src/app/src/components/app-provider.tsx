import type { ReactNode } from "react";
import ThemeProvider from "#/src/components/theme-provider";
import { Toaster } from "#/src/components/ui/sonner";
import { TooltipProvider } from "#/src/components/ui/tooltip";

export default function AppProvider({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <TooltipProvider>
        {children}
        <Toaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
