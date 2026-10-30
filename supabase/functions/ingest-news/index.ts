// Auge! news ingest: RSS + GDELT + Wikipedia → clustered "auges" → public.stories.
// Runs every 15 minutes via pg_cron (see supabase/news.sql). 100% free: no paid AI, no API keys.
//
// Sources (all free; Google News/Trends are not used: their terms forbid use outside personal readers)
//  - ~20 outlets' RSS (Spanish + English), with the photo each outlet publishes in its own feed.
//  - GDELT DOC API: coverage from thousands of outlets worldwide, plus each article's share image.
//  - Wikipedia pageviews: what people are actually reading about right now (attention signal),
//    and freely licensed photos of the people and places in each story.
//
// Pipeline
//  1. Pull feeds + GDELT and keep the last 24 h.
//  2. Drop junk (lotteries, horoscopes, recipes, live blogs, deals).
//  3. Cluster by shared named entities + keywords. Proper nouns and numbers ("Toledo", "Kim Jong-un",
//     "69") match across languages, so English coverage boosts a Spanish story without translation.
//  4. Write the report extractively from Spanish headlines/summaries (no generated text = no invented facts):
//     tag = cleanest short headline, brief = best lead sentence, facts = distinct outlets' angles.
//  5. Certainty from cross-source agreement: a figure/entity reported by ≥2 outlets is "confirmed",
//     hedged wording ("presunto", "podría", "según", "denuncia") is "uncertain", the rest "developing".
//  6. Category and region from keyword lexicons.
//  7. Heat = coverage (distinct outlets, volume, recency) + attention (Wikipedia views of its people/places).
//  8. Photos: outlets' own images (credited and linked), og:image as a fallback, plus a Wikipedia photo.

import { createClient } from 'npm:@supabase/supabase-js@2.118.0';

/** Editions: one per language. Each has its own outlets, Wikipedia and GDELT language. */
type Lang = 'es' | 'en' | 'de' | 'fr' | 'pt' | 'it' | 'ja' | 'zh' | 'ko';
/** Languages written without spaces between words: matched by character pairs instead of words. */
const CJK = new Set<Lang>(['ja', 'zh', 'ko']);
interface Feed {
  source: string;
  url: string;
  /** ISO country of the outlet's audience; 'INT' for international desks. */
  country?: string;
}
const EDITIONS: Record<Lang, { gdelt: string; feeds: Feed[] }> = {
  // Spain + all of Latin America
  es: {
    gdelt: 'spanish',
    feeds: [
      // España
      { source: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', country: 'ES' },
      { source: 'El Mundo', url: 'https://www.elmundo.es/rss/internacional.xml', country: 'ES' },
      { source: 'ABC', url: 'https://www.abc.es/rss/2.0/portada/', country: 'ES' },
      { source: 'La Vanguardia', url: 'https://www.lavanguardia.com/rss/home.xml', country: 'ES' },
      { source: '20minutos', url: 'https://www.20minutos.es/rss/', country: 'ES' },
      { source: 'elDiario.es', url: 'https://www.eldiario.es/rss/', country: 'ES' },
      { source: 'RTVE', url: 'https://api2.rtve.es/rss/temas_noticias.xml', country: 'ES' },
      { source: 'Europa Press', url: 'https://www.europapress.es/rss/rss.aspx?ch=00069', country: 'ES' },
      // México
      { source: 'El Universal', url: 'https://www.eluniversal.com.mx/arc/outboundfeeds/rss/?outputType=xml', country: 'MX' },
      { source: 'El Financiero', url: 'https://www.elfinanciero.com.mx/arc/outboundfeeds/rss/?outputType=xml', country: 'MX' },
      { source: 'Expansión', url: 'https://expansion.mx/rss', country: 'MX' },
      { source: 'La Jornada', url: 'https://www.jornada.com.mx/rss/edicion.xml', country: 'MX' },
      // Argentina
      { source: 'Clarín', url: 'https://www.clarin.com/rss/lo-ultimo/', country: 'AR' },
      { source: 'La Nación', url: 'https://www.lanacion.com.ar/arc/outboundfeeds/rss/?outputType=xml', country: 'AR' },
      { source: 'Infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/', country: 'AR' },
      { source: 'Perfil', url: 'https://www.perfil.com/feed', country: 'AR' },
      { source: 'Ámbito', url: 'https://www.ambito.com/rss/pages/home.xml', country: 'AR' },
      // Colombia
      { source: 'El Tiempo', url: 'https://www.eltiempo.com/rss/colombia.xml', country: 'CO' },
      { source: 'Semana', url: 'https://www.semana.com/arc/outboundfeeds/rss/?outputType=xml', country: 'CO' },
      // Chile
      { source: 'La Tercera', url: 'https://www.latercera.com/arc/outboundfeeds/rss/category/nacional/?outputType=xml', country: 'CL' },
      { source: 'Cooperativa', url: 'https://www.cooperativa.cl/noticias/site/tax/port/all/rss_3___1.xml', country: 'CL' },
      // Perú
      { source: 'El Comercio', url: 'https://elcomercio.pe/arc/outboundfeeds/rss/?outputType=xml', country: 'PE' },
      { source: 'La República', url: 'https://larepublica.pe/rss/home.xml', country: 'PE' },
      // Venezuela
      { source: 'El Nacional', url: 'https://www.elnacional.com/feed/', country: 'VE' },
      { source: 'Tal Cual', url: 'https://talcualdigital.com/feed/', country: 'VE' },
      { source: 'El Pitazo', url: 'https://elpitazo.net/feed/', country: 'VE' },
      // Ecuador, Guatemala, República Dominicana, Uruguay, Cuba
      { source: 'El Universo', url: 'https://www.eluniverso.com/arc/outboundfeeds/rss/?outputType=xml', country: 'EC' },
      { source: 'Prensa Libre', url: 'https://www.prensalibre.com/feed/', country: 'GT' },
      { source: 'Diario Libre', url: 'https://www.diariolibre.com/rss/portada.xml', country: 'DO' },
      { source: 'Montevideo Portal', url: 'https://www.montevideo.com.uy/anxml.aspx?59', country: 'UY' },
      { source: '14ymedio', url: 'https://www.14ymedio.com/rss/', country: 'CU' },
      // International desks in Spanish
      { source: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', country: 'INT' },
      { source: 'El País América', url: 'https://elpais.com/rss/elpais/portada_america.xml', country: 'INT' },
      { source: 'DW Español', url: 'https://rss.dw.com/xml/rss-sp-all', country: 'INT' },
      { source: 'France 24', url: 'https://www.france24.com/es/rss', country: 'INT' },
    ],
  },
  // United States + United Kingdom
  en: {
    gdelt: 'english',
    feeds: [
      // United States
      { source: 'The New York Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/HomePage.xml', country: 'US' },
      { source: 'CNN', url: 'http://rss.cnn.com/rss/cnn_topstories.rss', country: 'US' },
      { source: 'NBC News', url: 'https://feeds.nbcnews.com/nbcnews/public/news', country: 'US' },
      { source: 'CBS News', url: 'https://www.cbsnews.com/latest/rss/main', country: 'US' },
      { source: 'ABC News', url: 'https://feeds.abcnews.com/abcnews/topstories', country: 'US' },
      { source: 'NPR', url: 'https://feeds.npr.org/1001/rss.xml', country: 'US' },
      { source: 'Fox News', url: 'https://moxie.foxnews.com/google-publisher/latest.xml', country: 'US' },
      { source: 'The Hill', url: 'https://thehill.com/feed/', country: 'US' },
      // United Kingdom
      { source: 'BBC News', url: 'https://feeds.bbci.co.uk/news/rss.xml', country: 'GB' },
      { source: 'The Guardian', url: 'https://www.theguardian.com/uk/rss', country: 'GB' },
      { source: 'Sky News', url: 'https://feeds.skynews.com/feeds/rss/home.xml', country: 'GB' },
      { source: 'The Telegraph', url: 'https://www.telegraph.co.uk/rss.xml', country: 'GB' },
      { source: 'Daily Mail', url: 'https://www.dailymail.co.uk/news/index.rss', country: 'GB' },
    ],
  },
  // Germany, Switzerland, Austria
  de: {
    gdelt: 'german',
    feeds: [
      { source: 'tagesschau', url: 'https://www.tagesschau.de/xml/rss2/' },
      { source: 'DER SPIEGEL', url: 'https://www.spiegel.de/schlagzeilen/index.rss' },
      { source: 'ZEIT ONLINE', url: 'https://newsfeed.zeit.de/index' },
      { source: 'FAZ', url: 'https://www.faz.net/rss/aktuell/' },
      { source: 'DW', url: 'https://rss.dw.com/xml/rss-de-all' },
      { source: 'SRF', url: 'https://www.srf.ch/news/bnf/rss/1646' },
      { source: 'NZZ', url: 'https://www.nzz.ch/recent.rss' },
      { source: 'DER STANDARD', url: 'https://www.derstandard.at/rss' },
    ],
  },
  // France, Switzerland, Belgium
  fr: {
    gdelt: 'french',
    feeds: [
      { source: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml' },
      { source: 'Le Figaro', url: 'https://www.lefigaro.fr/rss/figaro_actualites.xml' },
      { source: 'franceinfo', url: 'https://www.francetvinfo.fr/titres.rss' },
      { source: 'France 24', url: 'https://www.france24.com/fr/rss' },
      { source: 'RTS', url: 'https://www.rts.ch/info/?format=rss/news' },
      { source: 'Le Soir', url: 'https://www.lesoir.be/rss/81853/cible_principale_gratuit' },
      { source: 'Le Parisien', url: 'https://feeds.leparisien.fr/leparisien/rss' },
      { source: '20 Minutes', url: 'https://www.20minutes.fr/feeds/rss-une.xml' },
      { source: 'Libération', url: 'https://www.liberation.fr/arc/outboundfeeds/rss/?outputType=xml' },
      { source: 'BFMTV', url: 'https://www.bfmtv.com/rss/news-24-7/' },
    ],
  },
  // Brazil, Portugal
  pt: {
    gdelt: 'portuguese',
    feeds: [
      { source: 'g1', url: 'https://g1.globo.com/rss/g1/' },
      { source: 'Folha', url: 'https://feeds.folha.uol.com.br/emcimadahora/rss091.xml' },
      { source: 'UOL', url: 'https://rss.uol.com.br/feed/noticias.xml' },
      { source: 'CNN Brasil', url: 'https://www.cnnbrasil.com.br/feed/' },
      { source: 'Observador', url: 'https://observador.pt/feed/' },
      { source: 'RTP', url: 'https://www.rtp.pt/noticias/rss' },
      { source: 'Expresso', url: 'https://expresso.pt/rss' },
    ],
  },
  // Japan
  ja: {
    gdelt: 'japanese',
    feeds: [
      { source: 'NHK', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml' },
      { source: '朝日新聞', url: 'https://www.asahi.com/rss/asahi/newsheadlines.rdf' },
      { source: '毎日新聞', url: 'https://mainichi.jp/rss/etc/mainichi-flash.rss' },
      { source: '日本経済新聞', url: 'https://assets.wor.jp/rss/rdf/nikkei/news.rdf' },
      { source: '時事通信', url: 'https://www.jiji.com/rss/ranking.rdf' },
    ],
  },
  // Chinese (mainland coverage from international outlets, Taiwan, Singapore)
  zh: {
    gdelt: 'chinese',
    feeds: [
      { source: 'BBC 中文', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml' },
      { source: 'DW 中文', url: 'https://rss.dw.com/xml/rss-chi-all' },
      { source: 'RFI 中文', url: 'https://www.rfi.fr/cn/rss' },
      { source: '中央社', url: 'https://feeds.feedburner.com/rsscna/intworld' },
      { source: '自由時報', url: 'https://news.ltn.com.tw/rss/world.xml' },
    ],
  },
  // South Korea
  ko: {
    gdelt: 'korean',
    feeds: [
      { source: '연합뉴스', url: 'https://www.yna.co.kr/rss/news.xml' },
      { source: '조선일보', url: 'https://www.chosun.com/arc/outboundfeeds/rss/?outputType=xml' },
      { source: '한겨레', url: 'https://www.hani.co.kr/rss/' },
      { source: '경향신문', url: 'https://www.khan.co.kr/rss/rssdata/total_news.xml' },
      { source: '동아일보', url: 'https://rss.donga.com/total.xml' },
      { source: 'BBC 코리아', url: 'https://feeds.bbci.co.uk/korean/rss.xml' },
    ],
  },
  it: {
    gdelt: 'italian',
    feeds: [
      { source: 'ANSA', url: 'https://www.ansa.it/sito/notizie/topnews/topnews_rss.xml' },
      { source: 'Corriere della Sera', url: 'https://xml2.corriereobjects.it/rss/homepage.xml' },
      { source: 'la Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml' },
      { source: 'RaiNews', url: 'https://www.rainews.it/rss/ultimora' },
      { source: 'Il Post', url: 'https://www.ilpost.it/feed/' },
      { source: 'TGCom24', url: 'https://www.tgcom24.mediaset.it/rss/homepage.xml' },
      { source: 'Il Sole 24 Ore', url: 'https://www.ilsole24ore.com/rss/italia.xml' },
      { source: 'Sky TG24', url: 'https://tg24.sky.it/rss/tg24.xml' },
    ],
  },
};

/** Edition built by this invocation (one per request, to stay within the edge CPU budget). */
let EDITION: Lang = 'es';

const WINDOW_HOURS = 24;
const MAX_ARTICLES = 1600;
const MAX_STORIES = 70;
const UA = 'AugeBot/0.2 (+https://github.com/powfuu/Auge-)';

interface Article {
  url: string;
  source: string;
  title: string;
  summary: string;
  lang: string;
  published_at: string;
  image: string | null;
  country?: string | null;
}

type Certainty = 'confirmed' | 'developing' | 'uncertain';

// ---------- RSS ----------

const decode = (s: string) =>
  s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;|&#34;/g, '"')
    .replace(/&#39;|&apos;|&#8217;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)))
    .replace(/&(rsquo|lsquo);/g, "'")
    .replace(/&(rdquo|ldquo);/g, '"')
    .replace(/&hellip;/g, '…')
    // Entity-encoded HTML (&lt;span…) only becomes markup after decoding: strip it again, including a
    // tag cut off at the end, so no stray "<span class=" ever reaches a reader.
    .replace(/<[^>]*>/g, ' ')
    .replace(/<[^>]*$/, '')
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const tagOf = (xml: string, name: string) => xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'))?.[1] ?? '';

/** The outlet's own photo for an item: media:content / media:thumbnail / enclosure / first <img>. */
function imageOf(item: string): string | null {
  const url =
    item.match(/<media:content[^>]*url="([^"]+)"[^>]*(medium="image"|type="image)/i)?.[1] ??
    item.match(/<media:content[^>]*url="([^"]+\.(?:jpe?g|png|webp)[^"]*)"/i)?.[1] ??
    item.match(/<media:thumbnail[^>]*url="([^"]+)"/i)?.[1] ??
    item.match(/<enclosure[^>]*url="([^"]+)"[^>]*type="image/i)?.[1] ??
    item.match(/<img[^>]*src="(https?:[^"]+)"/i)?.[1] ??
    null;
  return url ? url.replace(/&amp;/g, '&') : null;
}

async function fetchFeed(feed: Feed, lang: Lang): Promise<Article[]> {
  try {
    const res = await fetch(feed.url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(12_000) });
    if (!res.ok) return [];
    const bytes = new Uint8Array(await res.arrayBuffer());
    const head = new TextDecoder('ascii').decode(bytes.slice(0, 200));
    const charset = (res.headers.get('content-type')?.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)/i)?.[1] ?? 'utf-8').toLowerCase();
    let xml: string;
    try {
      xml = new TextDecoder(charset).decode(bytes);
    } catch {
      xml = new TextDecoder('utf-8').decode(bytes);
    }
    const items = xml.match(/<item[\s\S]*?<\/item>/gi) ?? xml.match(/<entry[\s\S]*?<\/entry>/gi) ?? [];
    const since = Date.now() - WINDOW_HOURS * 3_600_000;
    return items
      .map((item) => {
        const link = decode(tagOf(item, 'link')) || item.match(/<link[^>]*href="([^"]+)"/i)?.[1] || '';
        const date = new Date(decode(tagOf(item, 'pubDate') || tagOf(item, 'dc:date') || tagOf(item, 'updated') || tagOf(item, 'published')));
        return {
          url: link.trim(),
          source: feed.source,
          title: decode(tagOf(item, 'title')),
          summary: decode(tagOf(item, 'description') || tagOf(item, 'summary')).slice(0, 400),
          lang,
          published_at: (isNaN(date.getTime()) ? new Date() : date).toISOString(),
          image: imageOf(item),
          country: feed.country ?? null,
        };
      })
      .filter((a) => a.url.startsWith('http') && a.title.length > 15 && new Date(a.published_at).getTime() >= since)
      .map((a) => (lang !== 'en' && looksEnglish(a.title) ? { ...a, lang: 'en' } : a));
  } catch {
    return [];
  }
}

/** Cheap check: enough English function words and none of the edition's. */
function looksEnglish(title: string): boolean {
  const w = title.toLowerCase().split(/[^a-z']+/);
  const en = w.filter((x) => /^(the|of|to|and|in|is|for|on|with|as|has|have|after|over|from|by|what|how|why|set|amid)$/.test(x)).length;
  return en >= 2;
}

// ---------- GDELT (thousands of outlets; free, attribution: The GDELT Project) ----------

const GDELT_LANGS: Record<string, Lang> = { Spanish: 'es', English: 'en', German: 'de', French: 'fr', Portuguese: 'pt', Italian: 'it', Japanese: 'ja', Chinese: 'zh', Korean: 'ko' };

async function fetchGdelt(): Promise<Article[]> {
  try {
    const q = encodeURIComponent(`sourcelang:${EDITIONS[EDITION].gdelt}`);
    const res = await fetch(
      `https://api.gdeltproject.org/api/v2/doc/doc?query=${q}&mode=artlist&maxrecords=250&format=json&timespan=12h&sort=hybridrel`,
      { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(25_000) },
    );
    if (!res.ok) return [];
    const text = await res.text();
    if (!text.startsWith('{')) return []; // rate-limit notice comes back as plain text
    const { articles = [] } = JSON.parse(text) as {
      articles?: { url: string; title: string; seendate: string; domain: string; language: string; socialimage?: string }[];
    };
    return articles
      .filter((a) => GDELT_LANGS[a.language] && a.title)
      .map((a) => ({
        url: a.url,
        source: a.domain.replace(/^www\./, ''),
        title: a.title.trim(),
        summary: '',
        lang: GDELT_LANGS[a.language],
        published_at: new Date(a.seendate.replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, '$1-$2-$3T$4:$5:$6Z')).toISOString(),
        image: a.socialimage || null,
      }));
  } catch {
    return [];
  }
}

// ---------- Wikipedia attention + free photos ----------

/** Pages that are always popular and say nothing about today's news. */
const WIKI_NOISE = /^(Wikipedia|Especial|Special|Portada|Main_Page|Anexo|Categoría|Ayuda|File|Archivo)|^(YouTube|WhatsApp|Google|Facebook|Instagram|TikTok|Netflix|ChatGPT|Cleopatra|Xvideos|Pornhub|XXX)$/i;

/** title (folded, spaces) → views, from yesterday's most-read pages in es + en Wikipedia. */
async function fetchWikiAttention(): Promise<Map<string, { views: number; title: string; lang: string }>> {
  const out = new Map<string, { views: number; title: string; lang: string }>();
  const d = new Date(Date.now() - 86_400_000);
  const day = `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${String(d.getUTCDate()).padStart(2, '0')}`;
  await Promise.all(
    [...new Set([EDITION, 'en'])].map(async (lang) => {
      try {
        const res = await fetch(`https://wikimedia.org/api/rest_v1/metrics/pageviews/top/${lang}.wikipedia/all-access/${day}`, {
          headers: { 'user-agent': UA },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) return;
        const json = await res.json();
        for (const a of json.items?.[0]?.articles?.slice(0, 300) ?? []) {
          if (WIKI_NOISE.test(a.article)) continue;
          const key = fold(a.article.replace(/_/g, ' ').replace(/\s*\(.*\)$/, ''));
          const prev = out.get(key);
          if (!prev || prev.views < a.views) out.set(key, { views: a.views, title: a.article, lang });
        }
      } catch {
        // attention is a bonus signal; ranking still works without it
      }
    }),
  );
  return out;
}

interface WikiPhoto {
  url: string;
  page: string;
  title: string;
}

/** Lead photo of a Wikipedia page (Commons, free license). */
async function wikiPhoto(title: string, lang: string): Promise<WikiPhoto | null> {
  try {
    const res = await fetch(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`, {
      headers: { 'user-agent': UA },
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;
    const j = await res.json();
    const src: string | undefined = j.originalimage?.source ?? j.thumbnail?.source;
    if (!src || j.type === 'disambiguation') return null;
    return { url: src.split('?')[0], page: j.content_urls?.mobile?.page ?? j.content_urls?.desktop?.page, title: j.title };
  } catch {
    return null;
  }
}

/** og:image of an article page, for stories whose feeds carried no photo. */
async function ogImage(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8_000), redirect: 'follow' });
    if (!res.ok) return null;
    const head = (await res.text()).slice(0, 60_000);
    return (
      head.match(/<meta[^>]+property=["']og:image(?::url)?["'][^>]+content=["']([^"']+)/i)?.[1] ??
      head.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image/i)?.[1] ??
      null
    )?.replace(/&amp;/g, '&') ?? null;
  } catch {
    return null;
  }
}

// ---------- Text helpers ----------

// Strip Latin accents only, then recompose: Hangul syllables and kana with dakuten (プ) must survive intact.
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').normalize('NFC');

const JUNK = [
  /loter[ií]a|chontico|sorteo|resultados? (del|de la) (loter|sorteo|baloto)|n[uú]meros ganadores|quiniela|euromillones|primitiva/i,
  /hor[oó]scopo|signo del zodiaco|tarot/i,
  /receta|c[oó]mo preparar|ingredientes/i,
  /\ben (vivo|directo)\b|minuto a minuto|live:|as it happened/i,
  /ofertas?|descuentos?|black friday|cyber monday|cupones?/i,
  /qu[eé] (ver|series|pel[ií]culas) en (netflix|hbo|prime|disney)/i,
  /^clima en |clima (para )?(hoy|mañana)|pron[oó]stico del (tiempo|clima)|predicci[oó]n (del clima|para este)|^el tiempo en /i,
  /^(gu[ií]a|claves|preguntas y respuestas|todo lo que|qu[eé] se sabe|as[ií] (es|fue|son))\b/i,
  /\bopini[oó]n\b|^tribuna|^editorial|^an[aá]lisis:|^column/i,
  /\bwordle\b|crucigrama|sudoku/i,
  // de / fr / pt / it
  /lotto|gewinnzahlen|horoskop|rezept|liveticker|im liveblog|kommentar:|meinung:/i,
  /loto|horoscope|recette|en direct|direct :|tribune|chronique|bons plans|promo/i,
  /loteria|mega-sena|hor[oó]scopo|receita|ao vivo|opini[aã]o/i,
  /lotto|superenalotto|oroscopo|ricetta|in diretta|diretta live|editoriale|opinione/i,
];
const isJunk = (a: Article) => JUNK.some((r) => r.test(a.title));

const STOP = new Set(
  (
    'el la los las un una unos unas de del al y o u e ni en por para con sin sobre tras ante bajo desde hasta hacia entre que quien cual cuyo se su sus le les lo es son ha han he fue fueron era ser este esta estos estas ese esa eso aquel muy mas más menos ya no si sí también como cuando donde porque pero aunque tras según hoy ayer mañana año años día días tras nuevo nueva nuevos nuevas dice dicen tras ' +
    'the a an of to in on for with at by from and or is are was were be been after over as its it this that these those new says said say will would could has have had not but than into about more most can his her their they he she we you our us out up off why how what who ' +
    'der die das den dem des ein eine einen einem einer und oder aber nicht mit von zu im in am an auf aus bei nach vor für fur uber über um wie was wer wird werden wurde ist sind war hat haben sich auch noch nur mehr neue neuer neues heute gestern sagt ' +
    'le la les un une des du de au aux et ou mais pas avec pour par sur dans sous chez est sont etait ete été a ont il elle ils elles on ce cette ces son sa ses leur qui que quoi dont plus moins selon apres après avant nouveau nouvelle aujourd hui hier dit ' +
    'o a os as um uma uns umas do da dos das no na nos nas ao aos e ou mas nao não com para por sobre entre sem que se seu sua seus suas foi sao são era tem ter mais menos segundo apos após hoje ontem diz novo nova ' +
    'il lo la gli le un uno una dei degli delle del della dello di da in con su per tra fra e o ma non che chi si suo sua suoi sono era ha hanno piu più meno secondo dopo oggi ieri dice nuovo nuova'
  )
    .split(' ')
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '')),
);

const CJK_RUN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Hangul}]+/gu;
/** Character pairs of CJK text: "北朝鮮ミサイル" → 北朝, 朝鮮, 鮮ミ… Robust for headline matching without a tokenizer. */
function bigrams(t: string): string[] {
  const out: string[] = [];
  for (const run of t.match(CJK_RUN) ?? []) for (let i = 0; i < run.length - 1; i++) out.push(run.slice(i, i + 2));
  return out;
}

/** Lowercased content words (≥4 letters, no stopwords); CJK editions add character pairs. */
const words = (t: string) => (CJK.has(EDITION) ? [...bigrams(t), ...latinWords(t)] : latinWords(t));
const latinWords = (t: string) =>
  fold(t)
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter((w) => w.length >= 4 && !STOP.has(w));

/** Capitalised words that name institutions or dates in general, not a specific story. */
const GENERIC = new Set(
  (
    'gobierno government consejo council seguridad security ministerio ministry ministro minister presidente president partido party estado state ' +
    'nacional national congreso congress senado senate tribunal court policia police ejercito army oficina office comision commission union ' +
    'internacional international general federal republica republic reino kingdom norte north sur south este east oeste west nuevo ' +
    'lunes martes miercoles jueves viernes sabado domingo monday tuesday wednesday thursday friday saturday sunday enero febrero marzo abril mayo ' +
    'junio julio agosto septiembre octubre noviembre diciembre january february march april june july august september october november december ' +
    'video watch live ultima hora breaking exclusiva ' +
    'regierung bundesregierung prasident präsident minister ministerin kanzler partei staat polizei gericht armee bundestag bericht zeitung montag dienstag mittwoch donnerstag freitag samstag sonntag ' +
    'gouvernement president ministre parti etat police tribunal armee armée assemblee lundi mardi mercredi jeudi vendredi samedi dimanche ' +
    'governo presidente ministro partido estado policia tribunal exercito segunda terca quarta quinta sexta sabado domingo ' +
    'governo presidente ministro partito stato polizia tribunale esercito lunedi martedi mercoledi giovedi venerdi sabato domenica'
  ).split(' '),
);

/** Proper nouns (multi-word names kept together), acronyms and figures: language-independent anchors. */
function entities(t: string): Set<string> {
  const out = new Set<string>();
  if (CJK.has(EDITION)) {
    for (const k of t.match(/[\p{Script=Katakana}ー]{3,}/gu) ?? []) out.add(k);            // トランプ, ウクライナ
    for (const q of t.match(/[「『《“"]([^」』》”"]{2,12})[」』》”"]/gu) ?? []) out.add(q.slice(1, -1)); // quoted names
    for (const n of t.match(/\d{2,}/g) ?? []) out.add(n);
  }
  const tokens = t.replace(/[«»"“”‘’()¿?¡!:;,.]/g, ' | ').split(/\s+/).filter(Boolean);
  let run: string[] = [];
  const flush = () => {
    const name = run.map(fold).filter((w) => !GENERIC.has(w) && !STOP.has(w)).join(' ');
    // In German every noun is capitalised, so only multi-word names or acronyms count as entities.
    if (name.length > 2 && !CJK.has(EDITION) && (EDITION !== 'de' || name.includes(' ') || run.some((w) => /^\p{Lu}{2,6}$/u.test(w)))) out.add(name);
    run = [];
  };
  tokens.forEach((tok, i) => {
    const clean = tok.replace(/[^\p{L}\p{N}-]/gu, '');
    if (!clean || tok === '|') return flush();
    if (/^\d{2,}([.,]\d+)?$/.test(clean)) {
      flush();
      out.add(clean.replace(/[.,]/g, ''));
    } else if ((i > 0 && tokens[i - 1] !== '|' && /^\p{Lu}/u.test(clean) && clean.length > 1) || /^\p{Lu}{2,6}$/u.test(clean)) run.push(clean);
    else if (run.length && /^(de|del|la|el|y|of|the|von|van|der|da|do|di|du|le)$/i.test(clean)) run.push(clean);
    else flush();
  });
  flush();
  return out;
}

/** Country/region names place a story but don't identify it, so they can't merge stories on their own. */
let GEO: Set<string> | null = null;
const specific = (e: string) => {
  GEO ??= new Set(REGIONS.flatMap(([names, aliases]) => [...Object.values(names).map(fold), ...aliases.map((a) => a.trim())]));
  return !GEO.has(e) && !/^\d+$/.test(e);
};

const overlap = <T>(a: Set<T>, b: Set<T>) => {
  let n = 0;
  for (const x of a) if (b.has(x)) n++;
  return n;
};

// ---------- Clustering ----------

interface Group {
  idx: number[];
  ents: Set<string>;
  words: Set<string>;
}

function cluster(articles: Article[]): Group[] {
  const feats = articles.map((a) => ({ ents: entities(a.title + ' ' + a.summary.slice(0, 160)), words: new Set(words(a.title)) }));
  const groups: Group[] = [];
  // Spanish first so groups are anchored on Spanish wording; English then joins by entities.
  const order = articles.map((_, i) => i).sort((a, b) => (articles[a].lang === articles[b].lang ? 0 : articles[a].lang === EDITION ? -1 : 1));
  for (const i of order) {
    const f = feats[i];
    let best: Group | null = null;
    let bestScore = 0;
    for (const g of groups) {
      const shared = [...f.ents].filter((x) => g.ents.has(x));
      const spec = shared.filter(specific).length;
      const w = overlap(f.words, g.words);
      // A specific shared name plus one more anchor, or strong same-language wording overlap.
      const fullName = shared.some((x) => specific(x) && x.includes(' '));
      const score = spec >= 1 && shared.length >= 2 ? shared.length * 2 + w : fullName ? 3 + w : spec >= 1 && w >= 2 ? spec + w : w >= (CJK.has(EDITION) ? 5 : 4) ? w : 0;
      if (score > bestScore) {
        best = g;
        bestScore = score;
      }
    }
    if (best) {
      best.idx.push(i);
      f.ents.forEach((x) => best!.ents.add(x));
      f.words.forEach((x) => best!.words.add(x));
    } else groups.push({ idx: [i], ents: new Set(f.ents), words: new Set(f.words) });
  }
  return groups;
}

/**
 * Second pass: one event often splits in two (angles about the crash vs. about the victims).
 * Merge groups whose key name (covered by ≥3 outlets in each) is the same, e.g. "urda".
 */
function mergeGroups(groups: Group[], articles: Article[]): Group[] {
  const keyNames = (g: Group) => {
    const outlets = new Map<string, Set<string>>();
    for (const i of g.idx) for (const e of entities(articles[i].title + ' ' + articles[i].summary.slice(0, 160))) {
      if (!specific(e)) continue;
      if (!outlets.has(e)) outlets.set(e, new Set());
      outlets.get(e)!.add(articles[i].source);
    }
    return new Set([...outlets].filter(([, s]) => s.size >= 3).map(([e]) => e));
  };
  const big = groups.filter((g) => new Set(g.idx.map((i) => articles[i].source)).size >= 3);
  const keys = new Map(big.map((g) => [g, keyNames(g)]));
  const merged = new Set<Group>();
  for (const a of big) {
    if (merged.has(a)) continue;
    for (const b of big) {
      if (a === b || merged.has(b)) continue;
      if (overlap(keys.get(a)!, keys.get(b)!) >= 1) {
        a.idx.push(...b.idx);
        b.ents.forEach((x) => a.ents.add(x));
        b.words.forEach((x) => a.words.add(x));
        keys.get(b)!.forEach((x) => keys.get(a)!.add(x));
        merged.add(b);
      }
    }
  }
  return groups.filter((g) => !merged.has(g));
}

// ---------- Classification ----------

const CATEGORY_WORDS: Record<string, string[]> = {
  conflictos: ['戦争', '攻撃', 'ミサイル', '空爆', '軍', '战争', '袭击', '导弹', '军', '전쟁', '공격', '미사일', '공습', '군', 'guerra', 'war', 'ataque', 'attack', 'bombardeo', 'strike', 'misil', 'missile', 'dron', 'drone', 'ejercito', 'army', 'militar', 'military', 'gaza', 'ucrania', 'ukraine', 'hamas', 'hezbollah', 'tropas', 'troops', 'ofensiva', 'rebeldes', 'hutie', 'houthi', 'conflicto', 'killed in',
    'krieg', 'angriff', 'rakete', 'armee', 'soldaten', 'ukraine', 'guerre', 'attaque', 'frappe', 'missile', 'armee', 'soldats', 'ataque', 'exercito', 'soldados', 'guerra', 'attacco', 'esercito', 'soldati', 'bombardamento'],
  politica: ['選挙', '首相', '政府', '国会', '大統領', '自民', '与党', '野党', '議員', '中共', '全會', '全会', '政治局', '의원', '국민의힘', '민주당', '여당', '야당', '대통령실', '탄핵', '재판', '무죄', '검찰', '选举', '总统', '政府', '议会', '선거', '대통령', '정부', '국회', '총리', 'elecciones', 'election', 'gobierno', 'government', 'presidente', 'president', 'congreso', 'congress', 'parlamento', 'parliament', 'senado', 'senate', 'ministro', 'minister', 'partido', 'party', 'votacion', 'vote', 'campaña', 'campaign', 'onu', 'united nations', 'cumbre', 'summit', 'diplomat', 'sanciones', 'sanctions', 'trump', 'oposicion', 'opposition', 'ley', 'reforma',
    'wahl', 'regierung', 'bundestag', 'kanzler', 'partei', 'koalition', 'gesetz', 'election', 'gouvernement', 'assemblee', 'ministre', 'senat', 'loi', 'eleicao', 'eleicoes', 'governo', 'congresso', 'elezioni', 'governo', 'parlamento', 'legge'],
  economia: ['経済', '株価', '円安', '日銀', '日経平均', 'GDP', '利上げ', '財務相', '東証', '코스피', '코스닥', '순이익', '증시', '은행', '삼성전자', '하이닉스', '股价', '经济', '經濟', '经济', '股市', '关税', '경제', '주가', '환율', '금리', 'economia', 'economy', 'bolsa', 'stocks', 'mercado', 'market', 'inflacion', 'inflation', 'petroleo', 'oil', 'aranceles', 'tariff', 'banco', 'bank', 'dolar', 'dollar', 'euro', 'pib', 'gdp', 'empleo', 'jobs', 'empresa', 'company', 'precio', 'prices', 'deuda', 'debt', 'fed', 'bce',
    'wirtschaft', 'borse', 'börse', 'zinsen', 'unternehmen', 'preise', 'economie', 'bourse', 'entreprise', 'prix', 'economia', 'inflacao', 'juros', 'empresa', 'borsa', 'azienda', 'prezzi', 'inflazione'],
  sucesos: ['事故', '地震', '火災', '逮捕', '死亡', '刺され', '容疑', '墜落', '墜毀', '坠毁', '장애', '마비', '사고', '사망', '화재', '체포', '흉기', '事故', '地震', '火灾', '逮捕', '사고', '지진', '화재', '체포', 'accidente', 'accident', 'choque', 'crash', 'incendio', 'fire', 'terremoto', 'earthquake', 'huracan', 'hurricane', 'tormenta', 'storm', 'inundacion', 'flood', 'tiroteo', 'shooting', 'detenido', 'arrested', 'asesinato', 'murder', 'muertos', 'dead', 'heridos', 'injured', 'rescate', 'rescue', 'derrumbe', 'collapse', 'policia', 'police', 'trenes', 'train',
    'unfall', 'brand', 'erdbeben', 'unwetter', 'festgenommen', 'tote', 'verletzte', 'accident', 'incendie', 'seisme', 'tempete', 'interpelle', 'morts', 'blesses', 'acidente', 'incendio', 'mortos', 'feridos', 'preso', 'incidente', 'terremoto', 'morti', 'feriti', 'arrestato'],
  tecnologia: ['AI', '人工知能', '半導体', '暗号資産', 'ハッキング', '加密', '黑客', '해킹', '가상자산', '바이낸스', '人工智能', '芯片', '인공지능', '반도체', 'tecnologia', 'technology', 'inteligencia artificial', ' ia ', ' ai ', ' ki ', 'apple', 'google', 'meta', 'microsoft', 'openai', 'anthropic', 'chip', 'ciberataque', 'cyberattack', 'hackers', 'hack', 'data breach', 'espacio', 'space', 'nasa', 'satelite', 'satellite', 'software', 'robot',
    'kunstliche intelligenz', 'technik', 'intelligence artificielle', 'numerique', 'inteligencia', 'tecnologia', 'intelligenza artificiale'],
  deportes: ['野球', 'サッカー', '大谷', '足球', '篮球', '축구', '야구', '손흥민', 'futbol', 'football', 'soccer', 'liga', 'league', 'champions', 'barca', 'fc barcelona', 'real madrid cf', 'laliga', 'espanyol', 'atletico', 'delantero', 'futbolista', 'footballer', 'temporada', 'copa del rey', 'roland garros', 'wimbledon', 'grand prix', 'mundial', 'world cup', 'nba', 'mlb', 'nfl', 'serie mundial', 'world series', 'tenis', 'tennis', 'formula 1', 'f1', 'gol', 'goal', 'partido de', 'match', 'olimpic', 'olympic', 'entrenador', 'coach', 'fichaje',
    'fussball', 'fußball', 'bundesliga', 'trainer', 'tor ', 'ligue 1', 'entraineur', 'futebol', 'brasileirao', 'tecnico', 'calcio', 'serie a', 'allenatore'],
  sociedad: ['死去', '逝世', '去世', '별세', '추모', 'salud', 'health', 'educacion', 'education', 'cultura', 'culture', 'muere', 'dies', 'fallece', 'funeral', 'cine', 'film', 'musica', 'music', 'papa', 'pope', 'migrantes', 'migrants', 'clima', 'climate', 'familia', 'family',
    'gesundheit', 'schule', 'kultur', 'gestorben', 'sante', 'ecole', 'culture', 'saude', 'escola', 'morre', 'salute', 'scuola', 'morto', 'muore'],
};

const OBITUARY = /^(muere|fallece|adi[oó]s a|muri[oó]|dies|died|ist tot|gestorben|stirbt|meurt|mort de|décès|morre|morreu|muore|morto)\b|\bmuere (a los|el actor|la actriz|el cantante)|\b(ist|sind) tot\b|\bstirbt\b|\bgestorben\b|\best mort\b|\best d[eé]c[eé]d[eé]\b|\bmorre\b|\bmorreu\b|\bè morto\b|\bè morta\b|\bdies at\b|\bhas died\b|死去|逝世|去世|病逝|별세|숨져|사망했/i;

function categoryOf(text: string): string {
  // Deaths of public figures are society news, whatever other words the coverage uses.
  if (OBITUARY.test(text.trim().slice(0, 160))) return 'sociedad';
  // Hacks and crypto are tech stories even when the coverage says "attack".
  if (/cyber|hacker|hackeo|piratage|binance|bitcoin|cripto|crypto|ransomware/i.test(text.slice(0, 200))) return 'tecnologia';
  const t = ` ${fold(text)} `;
  let best = 'sociedad';
  let bestScore = 0;
  for (const [cat, list] of Object.entries(CATEGORY_WORDS)) {
    const score = list.reduce((s, w) => s + (t.includes(w) ? 1 : 0), 0);
    if (score > bestScore) {
      best = cat;
      bestScore = score;
    }
  }
  return best;
}

/** Region key → localized names; aliases are folded and multilingual. Order matters: more specific first. */
type Names = Record<'es' | 'en' | 'de' | 'fr' | 'pt' | 'it', string>;
const R = (es: string, en: string, de: string, fr: string, pt: string, it: string): Names => ({ es, en, de, fr, pt, it });
const REGIONS: [Names, string[]][] = [
  [R('Gaza', 'Gaza', 'Gaza', 'Gaza', 'Gaza', 'Gaza'), ['gaza']],
  [R('Israel', 'Israel', 'Israel', 'Israël', 'Israel', 'Israele'), ['israel', 'israeli', 'israele', 'knesset', 'netanyahu', 'イスラエル', '以色列', '이스라엘']],
  [R('Ucrania', 'Ukraine', 'Ukraine', 'Ukraine', 'Ucrânia', 'Ucraina'), ['ucrania', 'ukraine', 'ucraina', 'ucrania', 'kiev', 'kyiv', 'kiew', 'zelensky', 'selenskyj', 'ウクライナ', '乌克兰', '烏克蘭', '우크라이나']],
  [R('Rusia', 'Russia', 'Russland', 'Russie', 'Rússia', 'Russia'), ['rusia', 'russia', 'russland', 'russie', 'kremlin', 'kreml', 'moscu', 'moscow', 'moskau', 'moscou', 'putin', 'poutine', 'ロシア', 'プーチン', '俄罗斯', '俄羅斯', '普京', '러시아', '푸틴']],
  [R('EE. UU.', 'US', 'USA', 'États-Unis', 'EUA', 'USA'), ['estados unidos', 'ee.uu', 'eeuu', 'washington', 'casa blanca', 'white house', 'weisses haus', 'maison blanche', 'casa branca', 'casa bianca', 'trump', 'u.s.', ' us ', ' usa ', 'etats-unis', 'stati uniti', '米国', 'アメリカ', 'トランプ', '美国', '美國', '特朗普', '川普', '미국', '트럼프', 'midterms', 'legislativas', 'alaska', 'texas', 'california', 'florida', 'new york', 'nueva york']],
  [R('México', 'Mexico', 'Mexiko', 'Mexique', 'México', 'Messico'), ['mexico', 'mexiko', 'mexique', 'messico', 'cdmx', 'sheinbaum']],
  [R('España', 'Spain', 'Spanien', 'Espagne', 'Espanha', 'Spagna'), ['espana', 'spain', 'spanien', 'espagne', 'espanha', 'spagna', 'madrid', 'toledo', 'sanchez', 'andalucia', 'valencia', 'renfe']],
  [R('Venezuela', 'Venezuela', 'Venezuela', 'Venezuela', 'Venezuela', 'Venezuela'), ['venezuela', 'caracas', 'maduro', 'machado']],
  [R('Brasil', 'Brazil', 'Brasilien', 'Brésil', 'Brasil', 'Brasile'), ['brasil', 'brazil', 'brasilien', 'bresil', 'brasile', 'lula', 'bolsonaro', 'brasilia', 'sao paulo', 'rio de janeiro']],
  [R('Argentina', 'Argentina', 'Argentinien', 'Argentine', 'Argentina', 'Argentina'), ['argentina', 'argentinien', 'argentine', 'milei', 'buenos aires', 'casa rosada', 'kicillof']],
  [R('Colombia', 'Colombia', 'Kolumbien', 'Colombie', 'Colômbia', 'Colombia'), ['colombia', 'kolumbien', 'colombie', 'petro', 'bogota']],
  [R('Chile', 'Chile', 'Chile', 'Chili', 'Chile', 'Cile'), ['chile', 'chili', 'cile', 'santiago de chile', 'boric']],
  [R('Perú', 'Peru', 'Peru', 'Pérou', 'Peru', 'Perù'), ['peru', 'perou', 'lima']],
  [R('Cuba', 'Cuba', 'Kuba', 'Cuba', 'Cuba', 'Cuba'), ['cuba', 'kuba', 'habana', 'havana']],
  [R('China', 'China', 'China', 'Chine', 'China', 'Cina'), ['china', 'chine', 'cina', 'beijing', 'pekin', 'peking', 'pechino', 'xi jinping', 'taiwan', '中国', '習近平', '中國', '习近平', '北京', '台湾', '台灣', '중국', '시진핑', '대만']],
  [R('Corea del Norte', 'North Korea', 'Nordkorea', 'Corée du Nord', 'Coreia do Norte', 'Corea del Nord'), ['corea del norte', 'north korea', 'nordkorea', 'coree du nord', 'coreia do norte', 'corea del nord', 'kim jong', '北朝鮮', '朝鲜', '北韓', '북한', '김정은']],
  [R('Irán', 'Iran', 'Iran', 'Iran', 'Irã', 'Iran'), ['iran', 'teheran', 'tehran', 'イラン', '伊朗', ' 이란 ']],
  [R('Oriente Medio', 'Middle East', 'Nahost', 'Moyen-Orient', 'Oriente Médio', 'Medio Oriente'), ['yemen', 'jemen', 'hutie', 'houthi', 'siria', 'syria', 'syrien', 'syrie', 'libano', 'lebanon', 'libanon', 'liban', 'ormuz', 'hormuz', 'iraq', 'irak', 'arabia saudi', 'saudi']],
  [R('Reino Unido', 'UK', 'Großbritannien', 'Royaume-Uni', 'Reino Unido', 'Regno Unito'), ['reino unido', 'britain', 'united kingdom', 'grossbritannien', 'royaume-uni', 'regno unito', 'london', 'londres', 'londra', 'starmer']],
  [R('Francia', 'France', 'Frankreich', 'France', 'França', 'Francia'), ['francia', 'france', 'frankreich', 'franca', 'paris', 'parigi', 'macron']],
  [R('Alemania', 'Germany', 'Deutschland', 'Allemagne', 'Alemanha', 'Germania'), ['alemania', 'germany', 'deutschland', 'allemagne', 'alemanha', 'germania', 'berlin', 'berlino', 'merz', 'bundestag']],
  [R('Suiza', 'Switzerland', 'Schweiz', 'Suisse', 'Suíça', 'Svizzera'), ['suiza', 'switzerland', 'schweiz', 'suisse', 'suica', 'svizzera', 'zurich', 'zürich', 'geneve', 'genf', 'bern', 'berne']],
  [R('Austria', 'Austria', 'Österreich', 'Autriche', 'Áustria', 'Austria'), ['austria', 'osterreich', 'österreich', 'autriche', 'wien', 'vienna', 'vienne']],
  [R('Italia', 'Italy', 'Italien', 'Italie', 'Itália', 'Italia'), ['italia', 'italy', 'italien', 'italie', 'roma', 'rome', 'rom', 'meloni', 'milano', 'milan']],
  [R('Portugal', 'Portugal', 'Portugal', 'Portugal', 'Portugal', 'Portogallo'), ['portugal', 'portogallo', 'lisboa', 'lisbon', 'lissabon', 'lisbonne']],
  [R('Bélgica', 'Belgium', 'Belgien', 'Belgique', 'Bélgica', 'Belgio'), ['belgica', 'belgium', 'belgien', 'belgique', 'belgio', 'bruxelles']],
  [R('Unión Europea', 'EU', 'EU', 'UE', 'UE', 'UE'), ['union europea', 'european union', 'europaische union', 'union europeenne', 'uniao europeia', 'unione europea', 'bruselas', 'brussels', 'brussel', ' ue ', ' eu ', ' bce ', ' ecb ', ' ezb ', 'lagarde', 'von der leyen', 'eurozona', 'eurozone']],
  [R('India', 'India', 'Indien', 'Inde', 'Índia', 'India'), ['india', 'indien', 'inde', 'modi', 'delhi', 'インド', '印度']],
  [R('Japón', 'Japan', 'Japan', 'Japon', 'Japão', 'Giappone'), ['japon', 'japan', 'japao', 'giappone', 'tokio', 'tokyo', '日本', '東京', '首相', '일본', '도쿄']],
  [R('Corea del Sur', 'South Korea', 'Südkorea', 'Corée du Sud', 'Coreia do Sul', 'Corea del Sud'), ['corea del sur', 'south korea', 'sudkorea', 'seoul', 'seul', '韓国', '韩国', '南韓', '한국', '서울', '이재명']],
  [R('África', 'Africa', 'Afrika', 'Afrique', 'África', 'Africa'), ['africa', 'afrika', 'afrique', 'sudan', 'nigeria', 'congo', 'kongo', 'etiopia', 'ethiopia', 'kenia', 'kenya']],
  [R('Haití', 'Haiti', 'Haiti', 'Haïti', 'Haiti', 'Haiti'), ['haiti']],
  [R('Ecuador', 'Ecuador', 'Ecuador', 'Équateur', 'Equador', 'Ecuador'), ['ecuador', 'quito', 'guayaquil', 'noboa']],
  [R('Uruguay', 'Uruguay', 'Uruguay', 'Uruguay', 'Uruguai', 'Uruguay'), ['uruguay', 'montevideo', 'orsi']],
  [R('Guatemala', 'Guatemala', 'Guatemala', 'Guatemala', 'Guatemala', 'Guatemala'), ['guatemala', 'arevalo']],
  [R('Rep. Dominicana', 'Dominican Republic', 'Dominikanische Republik', 'Rép. dominicaine', 'Rep. Dominicana', 'Rep. Dominicana'), ['republica dominicana', 'dominican republic', 'santo domingo', 'abinader']],
  [R('Bolivia', 'Bolivia', 'Bolivien', 'Bolivie', 'Bolívia', 'Bolivia'), ['bolivia', 'la paz', 'santa cruz de la sierra']],
  [R('Paraguay', 'Paraguay', 'Paraguay', 'Paraguay', 'Paraguai', 'Paraguay'), ['paraguay', 'asuncion']],
  [R('Centroamérica', 'Central America', 'Mittelamerika', 'Amérique centrale', 'América Central', 'America centrale'), ['honduras', 'nicaragua', 'el salvador', 'costa rica', 'panama', 'bukele', 'ortega']],
  [R('Turquía', 'Turkey', 'Türkei', 'Turquie', 'Turquia', 'Turchia'), ['turquia', 'turkey', 'turkei', 'turquie', 'turchia', 'erdogan', 'capadocia', 'istanbul', 'estambul']],
];
const GLOBAL: Names = R('Global', 'Global', 'Welt', 'Monde', 'Mundo', 'Mondo');

/** Display names for the Asian editions, keyed by the English name (falls back to English). */
const CJK_NAMES: Record<string, Partial<Record<Lang, string>>> = {
  Global: { ja: '世界', zh: '全球', ko: '세계' },
  US: { ja: '米国', zh: '美国', ko: '미국' }, China: { ja: '中国', zh: '中国', ko: '중국' }, Japan: { ja: '日本', zh: '日本', ko: '일본' },
  'South Korea': { ja: '韓国', zh: '韩国', ko: '한국' }, 'North Korea': { ja: '北朝鮮', zh: '朝鲜', ko: '북한' },
  Russia: { ja: 'ロシア', zh: '俄罗斯', ko: '러시아' }, Ukraine: { ja: 'ウクライナ', zh: '乌克兰', ko: '우크라이나' },
  Israel: { ja: 'イスラエル', zh: '以色列', ko: '이스라엘' }, Gaza: { ja: 'ガザ', zh: '加沙', ko: '가자' }, Iran: { ja: 'イラン', zh: '伊朗', ko: '이란' },
  'Middle East': { ja: '中東', zh: '中东', ko: '중동' }, EU: { ja: 'EU', zh: '欧盟', ko: 'EU' }, UK: { ja: '英国', zh: '英国', ko: '영국' },
  France: { ja: 'フランス', zh: '法国', ko: '프랑스' }, Germany: { ja: 'ドイツ', zh: '德国', ko: '독일' }, India: { ja: 'インド', zh: '印度', ko: '인도' },
  Brazil: { ja: 'ブラジル', zh: '巴西', ko: '브라질' }, Spain: { ja: 'スペイン', zh: '西班牙', ko: '스페인' }, Italy: { ja: 'イタリア', zh: '意大利', ko: '이탈리아' },
};
const ISO: Record<string, string> = {
  Spain: 'ES', Mexico: 'MX', Argentina: 'AR', Colombia: 'CO', Chile: 'CL', Peru: 'PE', Venezuela: 'VE', Cuba: 'CU', Ecuador: 'EC',
  Uruguay: 'UY', Guatemala: 'GT', 'Dominican Republic': 'DO', Bolivia: 'BO', Paraguay: 'PY', US: 'US', UK: 'GB', Brazil: 'BR',
  France: 'FR', Germany: 'DE', Switzerland: 'CH', Austria: 'AT', Italy: 'IT', Portugal: 'PT', Belgium: 'BE', Japan: 'JP',
  'South Korea': 'KR', China: 'CN', India: 'IN', Haiti: 'HT', Russia: 'RU', Ukraine: 'UA', Israel: 'IL', Iran: 'IR', Turkey: 'TR',
};
let lastRegion: Names | null = null;
const regionName = (n: Names) => (n as Partial<Record<Lang, string>>)[EDITION] ?? CJK_NAMES[n.en]?.[EDITION] ?? n.en;

/** Region from the lead text first (most reliable), else from all coverage when clearly dominant. */
function regionOf(lead: string, all: string): string {
  const r = bestRegion(lead, 1) ?? bestRegion(all, 2);
  lastRegion = r;
  if (!r && EDITION === 'ja' && !/[A-Za-z]{4,}/.test(lead)) return '日本';
  if (!r && EDITION === 'ko') return '한국';
  return regionName(r ?? GLOBAL);
}

function bestRegion(text: string, min: number): Names | null {
  const t = ` ${fold(text)} `;
  let best: Names | null = null;
  let bestScore = min - 1;
  for (const [name, aliases] of REGIONS) {
    const score = aliases.reduce((s, a) => s + (t.includes(a) ? 1 : 0), 0);
    if (score > bestScore) {
      best = name;
      bestScore = score;
    }
  }
  return best;
}

// ---------- Extractive report ----------

const HEDGE = /presunt|supuest|podr[ií]a|posible|se investiga|investiga|seg[uú]n (fuentes|medios)|denuncia|acusa|alleged|reportedly|may |might |could |unconfirmed|claims?|mutma[sß]lich|angeblich|k[oö]nnte|soll |pr[eé]sum|suppos[eé]|pourrait|selon (des|plusieurs)|accus|suposto|poderia|segundo fontes|acusa|presunto|potrebbe|secondo fonti|accusa|疑い|容疑|혐의|可能性|とみられ|据称|涉嫌|疑似|의혹|가능성|추정/i;
const PROGRESS = /sigue|contin[uú]a|aumenta|sube|eleva|al menos|provisional|todav[ií]a|a[uú]n|busca|rescate|negocia|developing|rises|at least|still|mindestens|weiter|steigt|noch|au moins|toujours|continue|encore|pelo menos|ainda|continua|almeno|ancora|sale|続く|続報|仍|持续|계속|여전히/i;

/** Headline cleaned for display: no outlet suffix, no "VIDEO:" prefixes, cut at a word boundary. */
function cleanTitle(t: string, max = 72) {
  if (CJK.has(EDITION)) {
    max = Math.round(max * 0.5);
    t = t.replace(/^(\[[^\]]{1,8}\]|【[^】]{1,8}】|(快讯|速報|속보)[:：]?)\s*/u, '');
  }
  let s = t.replace(/\s[|–—-]\s[^|–—-]{2,30}$/, '').replace(/^(video|v[ií]deo|fotos?|directo|última hora|breaking|watch)[:|]\s*/i, '').trim();
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const at = Math.max(cut.lastIndexOf(':'), cut.lastIndexOf(','));
  const space = cut.lastIndexOf(' ');
  s = at > (CJK.has(EDITION) ? 12 : 30) ? cut.slice(0, at) : space > max / 2 ? cut.slice(0, space) : cut;
  // Drop dangling connectors ("…acusa al Likud de") so the cut reads as a complete phrase.
  while (/\s(de|del|la|el|los|las|a|al|en|y|o|que|por|con|para|un|una|of|the|to|in|and|on|for|with)$/i.test(s)) s = s.replace(/\s\S+$/, '');
  return s.replace(/[\s,:;-]+$/, '');
}

const firstSentence = (s: string) => {
  const m = s.match(CJK.has(EDITION) ? /^(.{12,90}?[。！？])/ : /^(.{40,180}?[.!?])(\s|$)/);
  return (m ? m[1] : s.slice(0, 180)).trim();
};

/** confirmed = another outlet reports the same figure or the same claim (≥3 shared content words). */
function certaintyOf(a: Article, others: Article[]): Certainty {
  const text = a.title + ' ' + a.summary;
  if (HEDGE.test(text)) return 'uncertain';
  const figures = [...entities(a.title)].filter((e) => /^\d+$/.test(e));
  const w = new Set(words(a.title));
  const corroborated = others.some(
    (o) =>
      o.source !== a.source &&
      (figures.some((f) => (o.title + ' ' + o.summary).includes(f)) || overlap(w, new Set(words(o.title + ' ' + o.summary))) >= 3),
  );
  if (!corroborated) return 'developing';
  return PROGRESS.test(text) ? 'developing' : 'confirmed';
}

/** Explainers and roundups ("Preguntas y respuestas…", "De Adamuz a Toledo: estos son…") aren't facts. */
const EXPLAINER = /^(preguntas|qu[eé] |c[oó]mo |cu[aá]l|cu[aá]ndo|d[oó]nde|claves|lo que |estos son|as[ií] |por qu[eé]|qui[eé]n|de .+ a .+: |what |how |why |who |was |wie |warum |wer |qu'est-ce|comment |pourquoi |qui |o que |como |por que |quem |cosa |come |perch[eé] |chi )/i;

function report(group: Group, articles: Article[]) {
  const arts = group.idx.map((i) => articles[i]).sort((a, b) => b.published_at.localeCompare(a.published_at));
  const es = arts.filter((a) => a.lang === EDITION);
  const pool = es.length ? es : arts;

  // Which outlets mention each entity → cross-source agreement.
  const entityOutlets = new Map<string, Set<string>>();
  for (const a of arts) for (const e of entities(a.title + ' ' + a.summary)) {
    if (!entityOutlets.has(e)) entityOutlets.set(e, new Set());
    entityOutlets.get(e)!.add(a.source);
  }

  // Tag: shortest clean Spanish headline that still carries the shared entities.
  const shared = [...entityOutlets].filter(([e, s]) => s.size >= 2 && specific(e)).map(([e]) => e);
  const scored = pool
    .map((a) => {
      const t = cleanTitle(a.title);
      const hits = shared.filter((e) => fold(t).includes(e)).length;
      // Prefer headlines that fit without cutting, and never an explainer.
      const cut = t.length < cleanTitle(a.title, 999).length;
      const quote = /^["«“']/.test(t); // "No hay palabras…" reads as a quote, not as what happened
      return { a, t, score: hits * 10 - Math.abs(t.length - 55) / 5 - (cut ? 8 : 0) - (EXPLAINER.test(t) ? 20 : 0) - (quote ? 25 : 0) };
    })
    .sort((x, y) => y.score - x.score);
  const lead = scored[0];

  // Brief: the lead's first summary sentence, or another outlet's if it just repeats the headline.
  const briefSrc = pool.find((a) => a.summary && fold(firstSentence(a.summary)) !== fold(a.title)) ?? lead.a;
  const brief = cleanTitle(firstSentence(briefSrc.summary || briefSrc.title), 160);

  // Facts: one angle per outlet (Spanish only, so we never show untranslated text), most recent first.
  const seen = new Set<string>();
  const facts: { text: string; certainty: Certainty }[] = [];
  for (const a of pool) {
    if (seen.has(a.source) || facts.length >= 4) continue;
    const text = cleanTitle(a.title, 140);
    if (fold(text) === fold(lead.t) && pool.length > 1) continue;
    seen.add(a.source);
    if (EXPLAINER.test(text)) continue;
    // Skip near-repeats: another outlet saying the same thing adds certainty, not a new fact.
    const w = new Set(words(text));
    if ([lead.t, brief, ...facts.map((f) => f.text)].some((t) => overlap(w, new Set(words(t))) >= Math.min(4, Math.ceil(w.size * 0.6)))) continue;
    facts.push({ text, certainty: certaintyOf(a, arts) });
  }
  // Every outlet told the same story: the lead itself is the fact, as sure as its coverage.
  const outlets = new Set(arts.map((a) => a.source)).size;
  if (!facts.length) facts.push({ text: brief, certainty: outlets >= 3 && !HEDGE.test(brief) ? 'confirmed' : outlets >= 2 ? 'developing' : 'uncertain' });

  const allText = arts.map((a) => a.title + ' ' + a.summary).join(' ');
  const topEntities = [...entityOutlets]
    .sort((x, y) => y[1].size - x[1].size)
    .map(([e]) => e)
    .filter((e) => specific(e) && e.length > 3)
    // "stewart" is redundant next to "patrick stewart".
    .filter((e, _, all) => !all.some((o) => o !== e && o.includes(e)))
    .slice(0, 3);

  return {
    tag: lead.t,
    brief,
    // The headline says what the story is; side angles (politics around a crash) shouldn't relabel it.
    category: categoryOf(lead.t + ' ' + brief + ' ' + lead.t + ' ' + allText.slice(0, 600)),
    region: regionOf(lead.t + ' ' + brief, allText),
    country: (lastRegion && ISO[lastRegion.en]) || (EDITION === 'ja' ? 'JP' : EDITION === 'ko' ? 'KR' : null),
    countries: [...new Set(arts.map((a) => a.country).filter((c): c is string => !!c && c !== 'INT'))],
    topics: topEntities.map((e) => '#' + e.replace(/(^|[\s-])(\p{L})/gu, (_, s, c) => c.toUpperCase()).replace(/[\s-]/g, '')),
    facts,
    timeline: pool
      .slice()
      .sort((a, b) => a.published_at.localeCompare(b.published_at))
      .filter((a, i, all) => all.findIndex((x) => x.source === a.source) === i)
      .slice(-4)
      .map((a) => ({ at: a.published_at, text: cleanTitle(a.title, 120) })),
    arts,
    /** Names mentioned, most-covered first: used for Wikipedia attention and photos. */
    names: [...entityOutlets].sort((x, y) => y[1].size - x[1].size).map(([e]) => e).filter((e) => !/^\d+$/.test(e)),
  };
}

type Attention = Map<string, { views: number; title: string; lang: string }>;

/** Most-read Wikipedia page among the story's names (people and places people are looking up). */
function attentionOf(names: string[], wiki: Attention) {
  let best: { views: number; title: string; lang: string } | null = null;
  for (const n of names.slice(0, 12)) {
    const hit = wiki.get(n);
    if (hit && (!best || hit.views > best.views)) best = hit;
  }
  return best;
}

// ---------- Heat ----------

/**
 * 0–100 from coverage (distinct outlets, articles, recency) plus attention: how many people read the
 * Wikipedia page of its main person/place yesterday (10k views ≈ +8, 100k ≈ +16, 1M ≈ +24).
 */
function heat(arts: Article[], wikiViews = 0): number {
  const now = Date.now();
  const sources = new Set(arts.map((a) => a.source)).size;
  // Count at most 2 articles per outlet so one site publishing a series can't fake an auge.
  const perSource = new Map<string, number>();
  const counted = arts.filter((a) => {
    perSource.set(a.source, (perSource.get(a.source) ?? 0) + 1);
    return perSource.get(a.source)! <= 2;
  });
  const recency = counted.reduce((s, a) => s + Math.exp(-(now - new Date(a.published_at).getTime()) / (6 * 3_600_000)), 0);
  const attention = wikiViews > 1000 ? 8 * Math.log10(wikiViews / 1000) : 0;
  const raw = sources * 16 + counted.length * 2 + recency * 5 + attention - (sources === 1 ? 15 : 0);
  return Math.max(1, Math.min(100, Math.round(100 * (1 - Math.exp(-raw / 70)))));
}

interface Photo {
  type: 'image';
  url: string;
  page: string;
  credit: string;
  license: string;
  caption: string;
}

const titleCase = (s: string) => s.replace(/(^|\s)(\p{L})/gu, (_, sp, c) => sp + c.toUpperCase());

/**
 * Up to 4 photos for a story. Outlet images come from their own feeds (or the article's og:image)
 * and are always shown with the outlet's name and a link to the original. The Wikipedia photo is a
 * freely licensed portrait/place shot of the story's main name, labelled as context.
 */
async function photosFor(arts: Article[], names: string[], wikiHit: { title: string; lang: string } | null): Promise<Photo[]> {
  const photos: Photo[] = [];
  const seen = new Set<string>();
  const add = (url: string, a: Article) => {
    const key = url.replace(/\?.*$/, '');
    if (seen.has(key) || photos.length >= 3 || /logo|placeholder|default|sprite|\.svg|\.gif/i.test(url)) return;
    seen.add(key);
    photos.push({ type: 'image', url, page: a.url, credit: a.source, license: `© ${a.source}`, caption: cleanTitle(a.title, 120) });
  };
  // Spanish outlets first, one photo per outlet.
  const ordered = [...arts].sort((a, b) => (a.lang === b.lang ? 0 : a.lang === EDITION ? -1 : 1));
  const perOutlet = new Set<string>();
  for (const a of ordered) if (a.image && !perOutlet.has(a.source)) {
    perOutlet.add(a.source);
    add(a.image, a);
  }
  if (!photos.length) {
    const found = await Promise.all(ordered.slice(0, 3).map(async (a) => ({ a, img: await ogImage(a.url) })));
    for (const { a, img } of found) if (img) add(img, a);
  }

  // Wikipedia: the most-read matching page, else the top named person/place.
  const candidates = wikiHit ? [wikiHit] : names.filter((n) => n.includes(' ') || n.length > 5).slice(0, 2).map((n) => ({ title: titleCase(n), lang: EDITION as string }));
  for (const c of candidates) {
    const w = await wikiPhoto(c.title, c.lang);
    if (w && !seen.has(w.url)) {
      photos.push({ type: 'image', url: w.url, page: w.page, credit: 'Wikipedia', license: 'Licencia libre · Wikimedia Commons', caption: w.title });
      break;
    }
  }
  return photos;
}

const slug = (s: string) => fold(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

// ---------- Handler ----------

Deno.serve(async (req) => {
  if (req.headers.get('x-cron-secret') !== Deno.env.get('CRON_SECRET')) return new Response('forbidden', { status: 403 });
  const requested = new URL(req.url).searchParams.get('lang') as Lang | null;
  EDITION = requested && requested in EDITIONS ? requested : 'es';
  const db = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  // 1. Pull feeds + GDELT + Wikipedia attention in parallel; store new articles.
  const [feeds, gdelt, wiki] = await Promise.all([Promise.all(EDITIONS[EDITION].feeds.map((f) => fetchFeed(f, EDITION))).then((r) => r.flat()), fetchGdelt(), fetchWikiAttention()]);
  const fetched = [...new Map([...feeds, ...gdelt].map((a) => [a.url, a])).values()];
  if (fetched.length) await db.from('articles').upsert(fetched, { onConflict: 'url' }); // refreshes image/country of known articles

  // 2. Last 24 h of stored articles (also covers feeds that failed this run), minus junk.
  const { data, error } = await db
    .from('articles')
    .select('url, source, title, summary, lang, published_at, image, country')
    .in('lang', [...new Set([EDITION, 'en'])])
    .gte('published_at', new Date(Date.now() - WINDOW_HOURS * 3_600_000).toISOString())
    .order('published_at', { ascending: false })
    .limit(MAX_ARTICLES);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const articles = (data as Article[]).filter((a) => !isJunk(a));

  // 3–6. Cluster, keep events with a Spanish headline, write reports, score.
  const ranked = mergeGroups(cluster(articles), articles)
    .filter((g) => g.idx.some((i) => articles[i].lang === EDITION))
    .map((g) => {
      const r = report(g, articles);
      const wikiHit = attentionOf(r.names, wiki);
      return { ...r, wikiHit, score: heat(r.arts, wikiHit?.views) };
    })
    .sort((a, b) => b.score - a.score);
  // The world's top auges, plus each country's own: up to 3 local stories per outlet country,
  // so a reader in Lima or Manchester also sees what's happening at home.
  const picked = new Set(ranked.slice(0, MAX_STORIES - 15));
  const outletCountries = [...new Set(EDITIONS[EDITION].feeds.map((f) => f.country).filter((c): c is string => !!c && c !== 'INT'))];
  for (const cc of outletCountries) {
    ranked.filter((r) => !picked.has(r) && r.countries.includes(cc) && (r.country === cc || r.countries.length === 1)).slice(0, 3).forEach((r) => picked.add(r));
  }
  for (const r of ranked) if (picked.size < MAX_STORIES) picked.add(r);
  const reports = ranked.filter((r) => picked.has(r));

  // 7–8. Photos, in parallel: outlets' own images first, og:image fallback, then a free Wikipedia photo.
  const media = await Promise.all(reports.map((r) => photosFor(r.arts, r.names, r.wikiHit)));

  // Match to existing stories (a shared article URL keeps the same id, so follows survive).
  const { data: existing } = await db.from('stories').select('id, article_urls').eq('active', true).eq('lang', EDITION);
  const today = new Date().toISOString().slice(0, 10);
  const rows = reports
    .map((r, i) => {
      const urls = r.arts.map((a) => a.url);
      const prev = existing?.find((s) => (s.article_urls as string[]).some((u) => urls.includes(u)));
      const { arts, names: _names, wikiHit: _wiki, score, ...rest } = r;
      return {
        ...rest,
        id: prev?.id ?? `${EDITION}-${slug(r.tag)}-${today}`,
        lang: EDITION,
        heat: score,
        media: media[i],
        image: media[i][0]?.url ?? null,
        sources: [...new Map(arts.map((a) => [a.source, { name: a.source, url: a.url }])).values()].slice(0, 6),
        clustered: arts.length,
        article_urls: urls,
        active: true,
        updated_at: arts[0].published_at,
      };
    })
    .filter((r, i, all) => all.findIndex((x) => x.id === r.id) === i);

  const { error: upsertError } = await db.from('stories').upsert(rows, { onConflict: 'id' });
  if (upsertError) return Response.json({ error: upsertError.message }, { status: 500 });
  const ids = rows.map((r) => `"${r.id}"`).join(',');
  if (rows.length) await db.from('stories').update({ active: false }).eq('active', true).eq('lang', EDITION).not('id', 'in', `(${ids})`);

  return Response.json({
    edition: EDITION,
    feeds: feeds.length,
    gdelt: gdelt.length,
    wikiPages: wiki.size,
    considered: articles.length,
    stories: rows.length,
    withPhotos: rows.filter((r) => r.media.length).length,
  });
});
