import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Дизельные генераторы ENERGY | Подбор и стоимость",
  description: "Дизельные генераторы ENERGY в кожухе, контейнере и на шасси. Подбор, поставка, запуск и сервис в России и Казахстане.",
  metadataBase: new URL("https://energy-generator-selection.festratocaster.chatgpt.site"),
  openGraph: {
    title: "Генераторы ENERGY под вашу задачу",
    description: "От подбора до сервисной поддержки. Россия и Казахстан.",
    locale: "ru_RU", type: "website",
    images: [{url: "/assets/img/dir-sales.webp", width:760, height:536, alt:"Дизельные генераторы ENERGY"}],
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
