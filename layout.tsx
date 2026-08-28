import "./globals.css";

export const metadata = {
  title: "Family Groups",
  description: "Attendance and growth by leader",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
