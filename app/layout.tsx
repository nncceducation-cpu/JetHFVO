import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = { title: "Jet at a Glance | HFJV Call Tool", description: "A rapid HFJV bedside reference for trained neonatal clinicians." };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}

