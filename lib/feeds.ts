export type FeedGroup = 'rai' | 'aisa' | 'rapporten' | 'legal';
export type FeedPipeline = 'daily-brief' | 'legal-scan';
export type FeedLanguage = 'NL' | 'EN';
export type SourceLevel = 'primary' | 'secondary';

export interface FeedDefinition {
  id: string;
  label: string;
  url: string;
  language: FeedLanguage;
  groups: FeedGroup[];
  pipelines: FeedPipeline[];
  sourceLevel: SourceLevel;
  enabled: boolean;
}

const GOOGLE_ALERTS_ACCOUNT_ID = '09449303513221250695';

function googleAlert(
  feedId: string,
  label: string,
  language: FeedLanguage,
  groups: FeedGroup[]
): FeedDefinition {
  return {
    id: 'google-alert-' + feedId,
    label,
    url: 'https://www.google.com/alerts/feeds/' + GOOGLE_ALERTS_ACCOUNT_ID + '/' + feedId,
    language,
    groups,
    pipelines: groups.includes('legal')
      ? ['daily-brief', 'legal-scan']
      : ['daily-brief'],
    sourceLevel: 'secondary',
    enabled: true,
  };
}

function directFeed(
  id: string,
  label: string,
  url: string,
  language: FeedLanguage,
  groups: FeedGroup[],
  sourceLevel: SourceLevel = 'secondary'
): FeedDefinition {
  return {
    id,
    label,
    url,
    language,
    groups,
    pipelines: groups.includes('legal')
      ? ['daily-brief', 'legal-scan']
      : ['daily-brief'],
    sourceLevel,
    enabled: true,
  };
}

export const FEEDS: readonly FeedDefinition[] = [
  googleAlert('712363126844262138', 'AI governance compliance jobs - EN', 'EN', ['rai']),
  googleAlert('8360176497618447048', 'AI function titles jobs - EN', 'EN', ['rai']),
  googleAlert('712363126844260895', 'Enterprise AI governance jobs - EN', 'EN', ['rai']),
  googleAlert('14759970723841580188', 'EU AI Act - broad', 'EN', ['rai', 'legal']),
  googleAlert('3370223869929194536', 'AI Act compliance and enforcement', 'EN', ['rai', 'legal']),
  googleAlert('9227181759097594092', 'EC AI Office and EDPB', 'EN', ['rai', 'legal']),
  googleAlert('10002060156204655808', 'Law-firm AI Act briefings - EN', 'EN', ['rai', 'legal']),
  googleAlert('17378552453676393076', 'Law-firm AI Act briefings - NL', 'NL', ['rai', 'legal']),
  googleAlert('10529135105258354989', 'AI governance compliance jobs - broad', 'EN', ['rai']),
  googleAlert('16104860397407571115', 'AI governance NL and EU countries', 'EN', ['rai']),
  googleAlert('7124011456707508388', 'AI literacy and governance frameworks', 'EN', ['rai']),
  googleAlert('10002060156204656018', 'AI regulation Europe and NIST', 'EN', ['rai']),
  googleAlert('13385062984594143224', 'AI compliance market and fines', 'EN', ['rai']),
  googleAlert('2164771014014474126', 'ISO 42001 and ISO 42005', 'EN', ['rai']),
  googleAlert('451554340955659707', 'Shadow AI and shadow IT', 'EN', ['rai']),
  googleAlert('8058027391759189925', 'MKB AI governance NL', 'NL', ['rai']),
  googleAlert('8506129854880045759', 'AI law Europe - NL', 'NL', ['rai', 'legal']),
  googleAlert('1576620731540475628', 'AI recruitment compliance', 'EN', ['rai']),
  googleAlert('11046596549212494694', 'Shadow AI NL workplace', 'NL', ['rai']),
  directFeed(
    'ec-digital-strategy',
    'European Commission - digital strategy',
    'https://digital-strategy.ec.europa.eu/en/rss.xml',
    'EN',
    ['rai', 'legal'],
    'primary'
  ),
  directFeed(
    'nist-news',
    'NIST - news',
    'https://www.nist.gov/news-events/news/rss.xml',
    'EN',
    ['rai']
  ),
  directFeed(
    'ai-news',
    'Artificial Intelligence News',
    'https://artificialintelligence-news.com/feed/',
    'EN',
    ['rai']
  ),
  directFeed(
    'mit-technology-review',
    'MIT Technology Review',
    'https://www.technologyreview.com/feed/',
    'EN',
    ['rai']
  ),

  googleAlert('11398596379508912216', 'AI literacy NL workplace', 'NL', ['aisa']),
  googleAlert('3751838535575008662', 'AI upskilling and reskilling - NL', 'NL', ['aisa']),
  googleAlert('13822444391883320846', 'AI upskilling and reskilling - EU', 'EN', ['aisa']),
  googleAlert('11628233551391557605', 'AI employee training - NL', 'NL', ['aisa']),
  googleAlert('9854549709752547786', 'AI skills workforce - EU', 'EN', ['aisa']),
  googleAlert('17215868415462242323', 'Corporate AI training', 'EN', ['aisa']),
  googleAlert('3010114955718549497', 'SME EU AI Act compliance', 'EN', ['aisa']),
  googleAlert('13053141497936131359', 'DPO EU AI Act - NL', 'NL', ['aisa']),
  googleAlert('14220739381911567576', 'ISO 42001 certification - EN', 'EN', ['aisa']),
  googleAlert('14220739381911565544', 'ISO 42001 certification - NL', 'NL', ['aisa']),
  googleAlert('14171728769092608143', 'ISO 42005', 'EN', ['aisa']),
  googleAlert('10756906360246997719', 'Digital Government AI - NL', 'NL', ['aisa']),
  googleAlert('10756906360247000062', 'RVO AI subsidy MKB - NL', 'NL', ['aisa']),
  googleAlert('11006387725598065897', 'Dutch DPA - alert', 'NL', ['aisa', 'legal']),
  googleAlert('12740235320510231143', 'EU AI Act fines and enforcement', 'EN', ['aisa', 'legal']),
  googleAlert('10340594049990774976', 'AI Act member-state implementation', 'EN', ['aisa', 'legal']),
  googleAlert('1685465714473872504', 'Agentic AI governance', 'EN', ['aisa']),
  googleAlert('831771200614974644', 'AI governance MKB - NL', 'NL', ['aisa']),

  googleAlert('11020912532644878384', 'Research reports - alert 1', 'NL', ['rapporten']),
  googleAlert('9447431379538733276', 'Research reports - alert 2', 'NL', ['rapporten']),
  googleAlert('7579506280036186973', 'Research reports - alert 3', 'NL', ['rapporten']),
  googleAlert('9792893812522834631', 'Research reports - alert 4', 'NL', ['rapporten']),
  googleAlert('14534094429917281865', 'Research reports - alert 5', 'NL', ['rapporten']),
  googleAlert('7165356540150727077', 'Research reports - alert 6', 'NL', ['rapporten']),
  googleAlert('11467018644135564915', 'Research reports - alert 7', 'NL', ['rapporten']),
  googleAlert('8230374117749793457', 'Research reports - alert 8', 'NL', ['rapporten']),
  googleAlert('8061218653018401488', 'Research reports - alert 9', 'NL', ['rapporten']),
  googleAlert('12265904741182742856', 'Research reports - alert 10', 'NL', ['rapporten']),
  googleAlert('4953389541249954681', 'Research reports - alert 11', 'NL', ['rapporten']),
  googleAlert('16279712458524784408', 'Research reports - alert 12', 'NL', ['rapporten']),
  googleAlert('7022290479762771039', 'Research reports - alert 13', 'NL', ['rapporten']),
  directFeed('ser', 'SER', 'https://www.ser.nl/nl/rss', 'NL', ['rapporten']),
  directFeed('rathenau', 'Rathenau Instituut', 'https://www.rathenau.nl/nl/rss.xml', 'NL', ['rapporten']),
  directFeed('cbs-longread', 'CBS longreads', 'https://www.cbs.nl/nl-nl/rss/longread', 'NL', ['rapporten']),
  directFeed('cpb', 'CPB', 'https://www.cpb.nl/rss.xml', 'NL', ['rapporten']),
  directFeed('cedefop', 'Cedefop', 'https://www.cedefop.europa.eu/en/rss.xml', 'EN', ['rapporten']),
  directFeed('eurofound', 'Eurofound', 'https://www.eurofound.europa.eu/rss.xml', 'EN', ['rapporten']),
  directFeed('mckinsey', 'McKinsey Insights', 'https://www.mckinsey.com/Insights/rss.aspx', 'EN', ['rapporten']),
  directFeed('mit-smr', 'MIT Sloan Management Review', 'https://sloanreview.mit.edu/feed/', 'EN', ['rapporten']),
  directFeed('wef', 'World Economic Forum', 'https://agenda.weforum.org/feed/', 'EN', ['rapporten']),
  directFeed('stanford-hai', 'Stanford HAI', 'https://hai.stanford.edu/news/rss.xml', 'EN', ['rapporten']),

  directFeed(
    'dutch-dpa-news',
    'Dutch DPA - news',
    'https://www.autoriteitpersoonsgegevens.nl/nl/rss',
    'NL',
    ['legal'],
    'primary'
  ),
];

function assertUniqueFeeds(feeds: readonly FeedDefinition[]): void {
  const ids = new Set<string>();
  const urls = new Set<string>();

  for (const feed of feeds) {
    if (ids.has(feed.id)) {
      throw new Error('Duplicate feed id: ' + feed.id);
    }
    if (urls.has(feed.url)) {
      throw new Error('Duplicate feed URL: ' + feed.url);
    }
    ids.add(feed.id);
    urls.add(feed.url);
  }
}

assertUniqueFeeds(FEEDS);

export function getFeedsForPipeline(pipeline: FeedPipeline): FeedDefinition[] {
  return FEEDS.filter(feed => feed.enabled && feed.pipelines.includes(pipeline));
}

export function getFeedsByGroup(group: FeedGroup): FeedDefinition[] {
  return FEEDS.filter(feed => feed.enabled && feed.groups.includes(group));
}

export function getFeedGroupCounts(): Record<FeedGroup, number> {
  return {
    rai: getFeedsByGroup('rai').length,
    aisa: getFeedsByGroup('aisa').length,
    rapporten: getFeedsByGroup('rapporten').length,
    legal: getFeedsByGroup('legal').length,
  };
}
