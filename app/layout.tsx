import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const socialImage = `${protocol}://${host}/og.png`;
  const title = "Jet at a Glance | HFJV + CXR Call Tool";
  const description = "A confirmation-gated chest X-ray reader and rapid HFJV bedside reference for trained neonatal clinicians.";

  return {
    title,
    description,
    openGraph: { title, description, images: [{ url: socialImage, width: 1536, height: 1024, alt: "Jet at a Glance chest X-ray confirmation and HFJV guidance" }] },
    twitter: { card: "summary_large_image", title, description, images: [socialImage] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
