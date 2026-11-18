import {
  SeriesListContent,
  type SeriesRawSearchParams,
} from '@/app/series/series-list-content';

export interface FreeSeriesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function FreeSeriesPage({
  searchParams,
}: FreeSeriesPageProps) {
  const resolvedSearchParams: SeriesRawSearchParams = await searchParams;
  return SeriesListContent({
    kind: 'free',
    searchParams: resolvedSearchParams,
  });
}
