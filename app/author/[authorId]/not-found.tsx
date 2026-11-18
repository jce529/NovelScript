import Link from 'next/link';
import { BookOpen } from 'lucide-react';
import { SiteHeader } from '@/components/layout/site-header';
import { Button } from '@/components/ui/button';

export default function NotFound() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-[1152px] flex-col items-center gap-4 px-4 py-12 text-center">
        <BookOpen aria-hidden className="size-8 text-muted-foreground" />
        <h1 className="text-lg leading-[1.2] font-semibold">작가 페이지를 찾을 수 없어요</h1>
        <p className="text-sm text-muted-foreground">주소가 바뀌었거나 아직 공개된 작품이 없는 작가일 수 있어요.</p>
        <div className="flex flex-wrap justify-center gap-4">
          <Button className="min-h-11 px-4 text-sm font-semibold" nativeButton={false} render={<Link href="/series/free" />}>작품 둘러보기</Button>
          <Button className="min-h-11 px-4 text-sm font-semibold" variant="outline" nativeButton={false} render={<Link href="/search" />}>작가 검색하기</Button>
        </div>
      </main>
    </>
  );
}
