import { submitEmail } from './actions';

export default async function CompleteEmailPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-xl font-semibold">이메일을 입력해주세요</h1>
      <p className="text-gray-500 max-w-sm text-center">
        카카오 계정에서 이메일 정보를 받아오지 못했습니다. 서비스 이용을 위해 이메일을 등록해주세요.
      </p>
      {error && <p className="text-red-600">{error}</p>}
      <form action={submitEmail} className="flex flex-col gap-2">
        <input type="email" name="email" required placeholder="you@example.com" className="border rounded px-3 py-2" />
        <button type="submit" className="bg-black text-white rounded px-4 py-2">확인</button>
      </form>
    </main>
  );
}
