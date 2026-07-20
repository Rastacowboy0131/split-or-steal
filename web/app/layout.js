import "./globals.css";

export const metadata = {
  title: "Split or Steal | Hug or Rug",
  description: "Free-entry onchain game show on Robinhood chain. Hug for the share, rug for the pot.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
