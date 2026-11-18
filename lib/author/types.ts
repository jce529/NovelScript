export type AuthorWorkStatus = 'ongoing' | 'completed';
export type AuthorStatusFilter = 'all' | AuthorWorkStatus;
export type AuthorWorkSort = 'updated' | 'new' | 'popular';

export interface AuthorProfile {
  authorId: string;
  penName: string;
  penNameBio: string | null;
}

export interface AuthorStats {
  workCount: number;
  ongoingCount: number;
  completedCount: number;
  subscriberCount: number;
}

export interface AuthorWork {
  id: string;
  title: string;
  synopsis: string | null;
  coverImageUrl: string | null;
  genre: string | null;
  serialStatus: AuthorWorkStatus;
  createdAt: string;
  latestPublishedAt: string | null;
  chapterCount: number;
  totalViews: number;
  likeCount: number;
  ctr: number;
  popularityScore: number;
}

export interface AuthorWorkPage {
  items: AuthorWork[];
  nextOffset: number | null;
  totalCount: number;
}

export interface MyAuthorSubscription {
  authorId: string;
  penName: string;
  notify: boolean;
  subscribedAt: string;
}

export type AuthorQueryFailure = { ok: false; code: 'not_found' | 'unavailable'; error: string };
export type AuthorSubscriptionFailure = {
  ok: false;
  code: 'auth_required' | 'write_suspended' | 'write_forbidden' | 'write_unavailable' | 'unavailable';
  error: string;
};
export type ToggleAuthorSubscriptionResult =
  | { ok: true; notify: boolean; subscriberCount: number }
  | AuthorSubscriptionFailure;
