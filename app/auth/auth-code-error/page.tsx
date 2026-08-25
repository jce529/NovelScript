import Link from 'next/link';

export default function AuthCodeErrorPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">로그인에 실패했습니다</h1>
      <p className="text-gray-500">다시 시도해주세요.</p>
      <Link href="/login" className="underline">로그인 페이지로 돌아가기</Link>
    </main>
  );
}
