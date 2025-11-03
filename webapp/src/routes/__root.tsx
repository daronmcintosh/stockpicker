import { TanStackDevtools } from "@tanstack/react-devtools";
import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { Toaster } from "react-hot-toast";

import { ErrorFallback } from "../components/ErrorFallback";
import Header from "../components/Header";
import { SidebarProvider, useSidebar } from "../components/SidebarContext";
import { AuthProvider } from "../lib/auth";

import appCss from "../styles.css?url";

export const Route = createRootRoute({
  errorComponent: ErrorFallback,
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "StockPicker",
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),

  shellComponent: RootDocument,
});

function ContentWrapper({ children }: { children: React.ReactNode }) {
  const { shouldPushContent } = useSidebar();
  return (
    <div
      className={`overflow-x-hidden ${
        shouldPushContent
          ? "lg:ml-64 transition-[margin-left] duration-300"
          : "transition-[margin-left] duration-300"
      }`}
    >
      {children}
    </div>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <AuthProvider>
          <SidebarProvider>
            <Header />
            <ContentWrapper>{children}</ContentWrapper>
          </SidebarProvider>
          <Toaster position="bottom-center" />
          <TanStackDevtools
            config={{
              position: "bottom-right",
            }}
            plugins={[
              {
                name: "Tanstack Router",
                render: <TanStackRouterDevtoolsPanel />,
              },
            ]}
          />
        </AuthProvider>
        <Scripts />
      </body>
    </html>
  );
}
