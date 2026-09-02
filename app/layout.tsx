import "./globals.css";

export const metadata = {
  title: "FFG Tracker",
  description: "Attendance and growth by leader",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "FFG Tracker",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-icon.png",
  },
};

export const viewport = {
  themeColor: "#0a0a0a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
