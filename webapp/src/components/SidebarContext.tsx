import { type ReactNode, createContext, useContext, useMemo, useState } from "react";

const SIDEBAR_MODE_KEY = "app_sidebar_mode"; // "persistent" or "overlay"

type SidebarMode = "persistent" | "overlay";

interface SidebarContextType {
  sidebarMode: SidebarMode;
  toggleSidebarMode: () => void;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  shouldPushContent: boolean; // Derived: true when sidebar should push content on desktop
}

const SidebarContext = createContext<SidebarContextType | undefined>(undefined);

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [sidebarMode, setSidebarMode] = useState<SidebarMode>(() => {
    if (typeof window === "undefined") return "overlay";
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY);
    return (stored === "persistent" || stored === "overlay" ? stored : "overlay") as SidebarMode;
  });
  const [isOpen, setIsOpen] = useState(() => {
    if (typeof window === "undefined") return false;
    const stored = localStorage.getItem(SIDEBAR_MODE_KEY);
    return stored === "persistent";
  });

  const toggleSidebarMode = () => {
    const newMode = sidebarMode === "persistent" ? "overlay" : "persistent";
    // Update both states together - React will batch these synchronously
    // For persistent mode, ensure isOpen is true immediately so content shifts right
    const newIsOpen = newMode === "persistent";
    // Update both states in the same call to ensure they're in sync
    setSidebarMode(newMode);
    setIsOpen(newIsOpen);
    if (typeof window !== "undefined") {
      localStorage.setItem(SIDEBAR_MODE_KEY, newMode);
    }
  };

  // Derived: sidebar should push content when in persistent mode (always visible on desktop)
  // In persistent mode, sidebar is always visible on desktop (lg:translate-x-0)
  // In overlay mode, only push when sidebar is open
  const shouldPushContent = useMemo(() => {
    if (sidebarMode === "persistent") {
      return true; // Always push in persistent mode on desktop
    }
    return isOpen; // In overlay mode, only push when open
  }, [sidebarMode, isOpen]);

  return (
    <SidebarContext.Provider
      value={{ sidebarMode, toggleSidebarMode, isOpen, setIsOpen, shouldPushContent }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const context = useContext(SidebarContext);
  if (context === undefined) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
