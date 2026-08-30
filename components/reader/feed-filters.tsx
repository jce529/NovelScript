'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { GENRES } from '@/lib/works/genres';
import type { FeedSortMode, FeedSortBasis } from '@/lib/discovery/actions';

const RANKING_BASIS_LABEL: Record<FeedSortBasis, string> = {
  trending: '종합 인기순', views: '조회수순', likes: '좋아요순', ctr: '다음화 이동률순',
};

export function FeedFilters({
  genre, sortMode, sortBasis,
}: { genre: string; sortMode: FeedSortMode; sortBasis: FeedSortBasis }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function updateParams(next: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value); else params.delete(key);
    }
    router.push(`${pathname}?${params.toString()}#weekly-ranking`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select value={genre} onValueChange={(value: string | null) => updateParams({ genre: !value || value === '전체' ? undefined : value })}>
        <SelectTrigger aria-label="장르"><SelectValue>{() => genre}</SelectValue></SelectTrigger>
        <SelectContent>
          <SelectItem value="전체">전체</SelectItem>
          {GENRES.map((g) => <SelectItem key={g} value={g}>{g}</SelectItem>)}
        </SelectContent>
      </Select>

      <div className="flex items-center gap-1">
        <Button type="button" variant={sortMode === 'latest' ? 'default' : 'outline'} size="sm" onClick={() => updateParams({ sortMode: 'latest', sortBasis: undefined })}>최신</Button>
        <Button type="button" variant={sortMode === 'popular' ? 'default' : 'outline'} size="sm" onClick={() => updateParams({ sortMode: 'popular' })}>인기</Button>
      </div>

      {sortMode === 'popular' && (
        <Select value={sortBasis} onValueChange={(value: FeedSortBasis | null) => updateParams({ sortBasis: value ?? undefined })}>
          <SelectTrigger aria-label="정렬" className="w-36"><SelectValue>{() => RANKING_BASIS_LABEL[sortBasis]}</SelectValue></SelectTrigger>
          <SelectContent>
            {(Object.keys(RANKING_BASIS_LABEL) as FeedSortBasis[]).map((basis) => (
              <SelectItem key={basis} value={basis}>{RANKING_BASIS_LABEL[basis]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
