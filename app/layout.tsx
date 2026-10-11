import type { Metadata, Viewport } from "next";
import { Fraunces, Inter } from "next/font/google";
import { Nav } from "@/components/Nav";
import { UserProvider } from "@/components/UserProvider";
import "./globals.css";

const fraunces = Fraunces({ subsets: ["latin"], variable: "--font-fraunces", axes: ["opsz"] });
const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Tree Hunt",
  description: "Put the phone down. Go find the trees around you. A scavenger hunt built from real plant sightings near you, verified by AI.",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#F6F1E7" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable}`}>
      <body className="font-sans antialiased">
        <UserProvider>
          <Nav />
          <main className="mx-auto min-h-[calc(100dvh-3.5rem)] w-full max-w-[430px] md:border-x md:border-line">{children}</main>
        </UserProvider>
      </body>
    </html>
  );
}
