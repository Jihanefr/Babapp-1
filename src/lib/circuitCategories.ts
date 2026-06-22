export type CircuitCategory = 'see' | 'stay' | 'eat' | 'do';

export const CATEGORY_CONFIG: Record<
  CircuitCategory,
  { label: string; icon: string; color: string }
> = {
  see: { label: 'Things to See', icon: 'eye-outline', color: '#C8A882' },
  stay: { label: 'Places to Stay', icon: 'bed-outline', color: '#E07A9B' },
  eat: { label: 'Places to Eat', icon: 'restaurant-outline', color: '#F07A3A' },
  do: { label: 'Things to Do', icon: 'bicycle-outline', color: '#4BAF79' },
};

const SEE_KEYWORDS = [
  'hike', 'trail', 'walk', 'mountain', 'park', 'view', 'monument',
  'museum', 'beach', 'lake', 'waterfall', 'canyon', 'tour', 'explore',
  'ruins', 'castle', 'bridge', 'garden', 'forest', 'cliff', 'cave',
  'circuit', 'trek', 'route', 'gorge', 'valley',
];

const STAY_KEYWORDS = [
  'hotel', 'hostel', 'camp', 'lodge', 'resort', 'stay', 'guesthouse',
  'airbnb', 'cabin', 'villa', 'apartment', 'riad', 'auberge', 'shelter',
];

const EAT_KEYWORDS = [
  'restaurant', 'cafe', 'food', 'eat', 'dine', 'bakery', 'bistro',
  'cuisine', 'market', 'grill', 'pizzeria', 'coffee', 'tea', 'bar',
];

const DO_KEYWORDS = [
  'activity', 'adventure', 'sport', 'surf', 'dive', 'ski', 'kayak',
  'climb', 'cycle', 'bike', 'swim', 'yoga', 'spa', 'bowling', 'golf',
  'zip', 'raft', 'snorkel', 'paraglid', 'horse', 'sail', 'fish',
  'class', 'workshop', 'lesson', 'experience', 'excursion',
];

export function guessCategory(title: string, description?: string | null): CircuitCategory {
  const text = `${title} ${description ?? ''}`.toLowerCase();

  const stayScore = STAY_KEYWORDS.filter((k) => text.includes(k)).length;
  const eatScore = EAT_KEYWORDS.filter((k) => text.includes(k)).length;
  const seeScore = SEE_KEYWORDS.filter((k) => text.includes(k)).length;
  const doScore = DO_KEYWORDS.filter((k) => text.includes(k)).length;

  const scores = [
    { cat: 'stay' as const, score: stayScore },
    { cat: 'eat' as const, score: eatScore },
    { cat: 'do' as const, score: doScore },
    { cat: 'see' as const, score: seeScore },
  ];
  scores.sort((a, b) => b.score - a.score);

  if (scores[0].score > 0 && scores[0].score > scores[1].score) return scores[0].cat;
  return 'see';
}
