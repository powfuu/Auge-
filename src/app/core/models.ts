export type Certainty = 'confirmed' | 'developing' | 'uncertain';

export interface Fact {
  text: string;
  certainty: Certainty;
}

export interface Source {
  name: string;
  url: string;
}

/** A social media post about the event. Simulated until a social API is connected. */
export interface Post {
  platform: string;
  author: string;
  handle: string;
  text: string;
}

export type Category = 'politica' | 'conflictos' | 'economia' | 'sucesos' | 'sociedad' | 'tecnologia' | 'deportes';

export interface Story {
  id: string;
  tag: string;
  region: string;
  /** 0–100: how fast the event is rising worldwide */
  heat: number;
  updatedAt: Date;
  /** One-line brief shown in the feed */
  brief: string;
  /** Short report shown in detail, each line tagged with its certainty */
  facts: Fact[];
  sources: Source[];
  /** How many original articles were collapsed into this story */
  clustered: number;
  category: Category;
  /** Simulated until a social listening provider is connected. */
  pulse: { mood: string; networks: { name: string; volume: number }[] };
  /** Related hashtags trending on social networks */
  topics: string[];
  posts: Post[];
  /** Photos (free-licensed context images) and videos (links to the original). */
  media: Media[];
  /** Reported developments in order; times are approximate. */
  timeline: { at: Date; text: string }[];
  /** What circulates on social networks vs. what sources confirm. Claims are simulated examples. */
  claims: Claim[];
}

export type Media =
  | { type: 'image'; url: string; page: string; credit: string; license: string; caption: string }
  | { type: 'video'; url: string; title: string; source: string };

export interface Claim {
  claim: string;
  verdict: 'contradicted' | 'unproven' | 'consistent';
  note: string;
}
