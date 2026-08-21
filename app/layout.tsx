import type { Metadata } from "next";
import "./globals.css";

const siteOrigin = process.env.NEXT_PUBLIC_SITE_ORIGIN ?? "https://jet-at-a-glance-hfjv.calnncc.chatgpt.site";
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const siteBase = `${siteOrigin}${basePath}/`;
const socialImage = `${siteOrigin}${basePath}/og.png`;
const title = "Jet at a Glance | HFJV + CXR Call Tool";
const description = "A confirmation-gated chest X-ray reader and rapid HFJV bedside reference for trained neonatal clinicians.";

export const metadata: Metadata = {
  metadataBase: new URL(siteBase),
  title,
  description,
  openGraph: { title, description, url: siteBase, images: [{ url: socialImage, width: 1536, height: 1024, alt: "Jet at a Glance chest X-ray confirmation and HFJV guidance" }] },
  twitter: { card: "summary_large_image", title, description, images: [socialImage] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
