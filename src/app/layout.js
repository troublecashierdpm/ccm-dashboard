import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata = {
  title: "Dashboard CCM DPM",
  description: "Staff Performance Dashboard AEON",
};

export default function RootLayout({ children }) {
  return (
    <html lang="id">
      <head>
        {/* SUNTIKAN TAILWIND ANTI-GAGAL */}
        <script src="https://cdn.tailwindcss.com"></script>
        <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.4.0/css/all.min.css" />
      </head>
      <body className={inter.className}>{children}</body>
    </html>
  );
}
