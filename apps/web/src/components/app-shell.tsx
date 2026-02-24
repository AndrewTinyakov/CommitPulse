import type { ReactNode } from "react";
import { SignedIn, SignedOut, SignInButton, UserButton } from "@clerk/nextjs";
import { Sidebar, MobileNav, type ViewId } from "./sidebar";

const viewTitles: Record<ViewId, string> = {
  dashboard: "Dashboard",
  connections: "Connections",
  settings: "Settings",
};

export default function AppShell({
  activeView,
  onNavigate,
  authLoaded,
  children,
}: {
  activeView: ViewId;
  onNavigate: (view: ViewId) => void;
  authLoaded: boolean;
  children: ReactNode;
}) {
  return (
    <div className="app-layout">
      <Sidebar activeView={activeView} onNavigate={onNavigate} />
      <MobileNav activeView={activeView} onNavigate={onNavigate} />

      <main className="app-main">
        <header className="app-header">
          <h1 className="page-title">{viewTitles[activeView]}</h1>
          <div className="flex items-center gap-3">
            {authLoaded && (
              <>
                <SignedOut>
                  <SignInButton>
                    <button className="btn btn-primary btn-sm">Sign in</button>
                  </SignInButton>
                </SignedOut>
                <SignedIn>
                  <UserButton
                    appearance={{
                      elements: { userButtonAvatarBox: "h-7 w-7" },
                    }}
                  />
                </SignedIn>
              </>
            )}
          </div>
        </header>

        <div className="app-content">{children}</div>
      </main>
    </div>
  );
}
