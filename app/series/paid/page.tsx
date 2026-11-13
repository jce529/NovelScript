import {
  SeriesListContent,
  type SeriesRawSearchParams,
} from '@/app/series/series-list-content';

export interface PaidSeriesPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function PaidSeriesPage({
  searchParams,
}: PaidSeriesPageProps) {
  const resolvedSearchParams: SeriesRawSearchParams = await searchParams;
  return SeriesListContent({
    kind: 'paid',
    searchParams: resolvedSearchParams,
  });
}
