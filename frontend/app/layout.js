import "./globals.css";
import Header from "../components/Header";
import { WalletProvider } from "../components/WalletProvider";

export const metadata = {
  title: "MilestoneVault",
  description: "Milestone-based crowdfunding escrow",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <WalletProvider>
          <Header />
          <main className="shell">{children}</main>
        </WalletProvider>
      </body>
    </html>
  );
}
