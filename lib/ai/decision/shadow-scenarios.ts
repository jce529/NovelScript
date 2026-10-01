import type { FolderCandidate, TemplateOption } from '@/lib/kb/actions';
import type { KbCategory } from '@/lib/kb/categories';

/**
 * Approved synthetic shadow scenario pool v1 — unrelated to any real work or
 * request. Kept separate from the offline eval golden set (lib/ai/decision/eval)
 * so shadow-quality drift and eval-quality drift are never conflated. Bump
 * SHADOW_SCENARIO_VERSION whenever this pool changes.
 */
export const SHADOW_SCENARIO_VERSION = 'shadow-v1';

export type ShadowBucket = `${'short' | 'medium' | 'long'}:${'ctx' | 'noctx'}:${'mention' | 'nomention'}`;

export interface ShadowScenario {
  id: string;
  bucket: ShadowBucket;
  state: { userRequest: string; chapterContext: string; mentionedFacts: string[] };
  expectedTask: 'reply' | 'draft' | 'document' | 'clarify';
  expectedCategory?: KbCategory;
  folders: FolderCandidate[];
  templates: TemplateOption[];
}

function folderFor(category: string, nested: boolean): FolderCandidate[] {
  const root: FolderCandidate = { id: `syn-root-${category}`, name: category, isRoot: true, path: '', version: `syn-root-${category}:v1` };
  if (!nested) return [root];
  return [root, { id: `syn-sub-${category}`, name: '주요', isRoot: false, path: '주요', version: `syn-root-${category}:v1/syn-sub-${category}:주요` }];
}

function templatesFor(category: string): TemplateOption[] {
  return [
    { id: null, name: `${category} 기본 템플릿`, scope: 'canonical', content: `# <% tp.file.title %>\n## 기본 정보\n## 특이사항`, isDefault: true },
    { id: `syn-tpl-${category}`, name: `${category} 상세 템플릿`, scope: 'work', content: `# <% tp.file.title %>\n## 배경\n## 관계\n## 비고`, isDefault: false },
  ];
}

const CATS: KbCategory[] = ['인물', '장소', '사건', '세력', '아이템'];

interface RawCase {
  userRequest: string;
  chapterContext: string;
  mentionedFacts: string[];
  expectedTask: ShadowScenario['expectedTask'];
  category?: KbCategory;
}

/** 4 hand-written cases per bucket (2 document, then one each of clarify/reply/draft, rotated by bucket index for variety). */
function casesFor(size: 'short' | 'medium' | 'long', ctx: 'ctx' | 'noctx', mention: 'mention' | 'nomention', bucketIndex: number): RawCase[] {
  const hasCtx = ctx === 'ctx';
  const hasMention = mention === 'mention';
  const cat1 = CATS[bucketIndex % CATS.length];
  const cat2 = CATS[(bucketIndex + 2) % CATS.length];

  const chapterContexts: Record<'short' | 'medium' | 'long', string> = {
    short: '비가 그쳤다.',
    medium: '항구 마을의 새벽 시장에는 어부들이 그물을 손질하며 지난밤 이야기를 나누고 있었다.',
    long: '북쪽 국경의 요새 아래, 오래된 성벽을 따라 늘어선 초소마다 병사들이 교대를 기다리고 있었다. 몇 주 전 있었던 습격 이후 경계가 삼엄해졌고, 지휘관은 매일 밤 순찰 경로를 바꾸라고 명령했다. 성벽 너머로는 안개에 잠긴 평원이 끝없이 펼쳐져 있었고, 그 어딘가에서 적의 정찰대가 움직이고 있다는 소문이 돌았다.',
  };
  const mentionedFactsPool: Record<'short' | 'medium' | 'long', string[]> = {
    short: ['어부 한'],
    medium: ['시장 상인 조', '어부 한'],
    long: ['수비대장 렌', '정찰병 유이', '전임 지휘관 도른'],
  };

  const requestByTask: Record<ShadowScenario['expectedTask'], Record<'short' | 'medium' | 'long', string>> = {
    document: {
      short: `${cat1} 설정 정리해줘`,
      medium: `이번에 등장한 ${cat1} 관련 내용을 바탕으로 설정 문서를 하나 만들어줘. 이름과 배경 위주로.`,
      long: `방금 장면에서 다룬 ${cat1}에 대해 지금까지 나온 단서들을 종합해서 정식 설정 문서로 정리해줘. 이름과 겉모습, 말투 같은 기본적인 부분은 물론이고 성격이 형성된 배경이나 과거의 사건도 함께 담아줬으면 좋겠어. 특히 다른 ${cat2}와의 관계가 이야기 전개에서 중요한 역할을 할 것 같으니까 그 부분도 짧게라도 언급해주면 좋겠고, 아직 본문에서 확정되지 않은 세부 사항은 억지로 만들어내지 말고 미정으로 남겨줘. 나중에 다시 읽었을 때 바로 참고할 수 있도록 정리해줬으면 해.`,
    },
    clarify: {
      short: '그거 정리 좀',
      medium: '아까 그 사람 말이야, 이름이랑 배경 좀 정리해줄 수 있어? 아직 잘 모르겠어서.',
      long: '음 그러니까... 방금 나온 사람이랑 장소 둘 다 관련 있는 그 이야기 말인데, 어느 쪽을 기준으로 문서를 만들어야 할지 나도 사실 잘 모르겠어. 둘 다 이야기에서 꽤 중요한 것 같긴 한데, 지금 시점에서 뭘 먼저 정리해야 할지 판단이 잘 안 서네. 혹시 지금까지 나온 내용만 보고 어느 쪽이 더 급한지 네가 대신 판단해서 알려줄 수 있을까? 필요하면 나한테 먼저 물어봐도 괜찮아.',
    },
    reply: {
      short: '다음 장면 어떻게 갈까?',
      medium: '지금 분위기에서 주인공이 바로 반박하는 게 나을까 아니면 한 박자 쉬었다가 말하는 게 나을까?',
      long: '지금까지 쓴 부분을 다시 읽어봤는데, 갈등이 너무 빨리 해소되는 느낌이 들어서 조금 걱정이야. 독자 입장에서 이 장면을 읽는다고 생각했을 때, 여기서 긴장감을 좀 더 끌고 가려면 다음 대사를 어떤 식으로 이어가는 게 좋을지 의견을 듣고 싶어. 굳이 지금 바로 문서로 정리할 필요는 없고, 그냥 편하게 생각을 나누듯이 이야기해주면 충분해. 몇 가지 방향을 던져줘도 좋고, 네가 봤을 때 가장 자연스러운 흐름 하나만 짚어줘도 좋아.',
    },
    draft: {
      short: '다음 장면 써줘',
      medium: '두 사람이 항구에서 다시 마주치는 장면을 짧게 써줘, 대화 위주로 긴장감 있게 부탁해.',
      long: '지금 상황을 그대로 이어받아서 다음 장면을 초안으로 써줘. 인물들이 자기 속마음을 대놓고 설명하기보다는 행동과 대사만으로 긴장감이 드러났으면 좋겠고, 대화 사이사이에 미묘한 침묵이나 시선 처리 같은 것도 살짝 넣어주면 좋겠어. 장면이 끝날 때는 다음에 벌어질 사건으로 자연스럽게 이어질 수 있도록 여운을 남기는 방식으로 마무리해줬으면 해. 분량은 너무 길지 않게, 한 호흡에 읽을 수 있는 정도면 충분해.',
    },
  };

  const tasks: ShadowScenario['expectedTask'][] = ['document', 'document', ['clarify', 'reply', 'draft'][bucketIndex % 3] as ShadowScenario['expectedTask'], ['reply', 'draft', 'clarify'][bucketIndex % 3] as ShadowScenario['expectedTask']];

  return tasks.map((task, i) => ({
    userRequest: requestByTask[task][size],
    chapterContext: hasCtx ? chapterContexts[size] : '',
    mentionedFacts: hasMention ? mentionedFactsPool[size] : [],
    expectedTask: task,
    category: task === 'document' ? (i === 0 ? cat1 : cat2) : undefined,
  }));
}

const BUCKET_ORDER: ShadowBucket[] = (['short', 'medium', 'long'] as const).flatMap((size) =>
  (['ctx', 'noctx'] as const).flatMap((ctx) => (['mention', 'nomention'] as const).map((mention) => `${size}:${ctx}:${mention}` as ShadowBucket)),
);

export const SHADOW_SCENARIOS: ShadowScenario[] = BUCKET_ORDER.flatMap((bucket, bucketIndex) => {
  const [size, ctx, mention] = bucket.split(':') as ['short' | 'medium' | 'long', 'ctx' | 'noctx', 'mention' | 'nomention'];
  return casesFor(size, ctx, mention, bucketIndex).map((c, i) => ({
    id: `synthetic-${bucket.replace(/:/g, '-')}-${i}`,
    bucket,
    state: { userRequest: c.userRequest, chapterContext: c.chapterContext, mentionedFacts: c.mentionedFacts },
    expectedTask: c.expectedTask,
    ...(c.expectedTask === 'document' && c.category ? { expectedCategory: c.category } : {}),
    folders: folderFor(c.category ?? CATS[(bucketIndex + i) % CATS.length], i % 2 === 0),
    templates: templatesFor(c.category ?? CATS[(bucketIndex + i) % CATS.length]),
  }));
});
