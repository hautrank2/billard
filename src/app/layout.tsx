import type { Metadata } from "next";
import type { ReactNode } from "react";

import "./globals.css";

export const metadata: Metadata = {
  title: "RollNine",
  description: "Billiard 3D: đấu online, chơi với máy và luyện từng cú đánh.",
};

const RootLayout = ({ children }: { children: ReactNode }) => (
  <html lang="vi" className="dark">
    <body className="antialiased">{children}</body>
  </html>
);

export default RootLayout;
