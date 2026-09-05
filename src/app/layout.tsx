import type { Metadata } from 'next';
import { Gowun_Batang, Noto_Sans_KR } from 'next/font/google';
import './globals.css';

const gowunBatang = Gowun_Batang({
  weight: ['400', '700'],
  subsets: ['latin'],
  variable: '--font-gowun',
  display: 'swap',
});

const notoSansKR = Noto_Sans_KR({
  weight: ['400', '500', '700'],
  subsets: ['latin'],
  variable: '--font-noto',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Schedule Maker',
  description: '주간 스케줄 이미지 에디터',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang='ko' className={`h-full ${gowunBatang.variable} ${notoSansKR.variable}`}>
      <body className='flex min-h-full flex-col'>{children}</body>
    </html>
  );
}
