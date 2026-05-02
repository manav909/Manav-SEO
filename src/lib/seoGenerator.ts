export type DeliverableType = 'Technical' | 'On-Page' | 'Off-Page' | 'GEO';

export interface Deliverable {
  id: DeliverableType;
  title: string;
  shortTitle: string;
  description: string;
}

export const DELIVERABLES: Deliverable[] = [
  {
    id: 'Technical',
    title: 'Technical SEO Blueprint',
    shortTitle: 'Technical',
    description: 'Crawlability, Core Web Vitals, schema & site architecture audit.',
  },
  {
    id: 'On-Page',
    title: 'On-Page Content Gap',
    shortTitle: 'On-Page',
    description: 'Topical clusters, missing keywords & content opportunities.',
  },
  {
    id: 'Off-Page',
    title: 'Off-Page PR Strategy',
    shortTitle: 'Off-Page',
    description: 'Digital PR angles, link prospects & authority outreach plan.',
  },
  {
    id: 'GEO',
    title: 'Generative Engine Optimization',
    shortTitle: 'GEO',
    description: 'Optimize for ChatGPT, Perplexity & Google AI Overviews.',
  },
];

export const LOADING_STEPS = [
  'Crawling URL...',
  'Analyzing SERP intent...',
  'Mapping competitor landscape...',
  'Synthesizing AI insights...',
  'Writing deliverable...',
];

// Calls the real Claude AI API and streams the response back
// onChunk is called with each piece of text as it arrives
export async function generateDeliverable(
  type: DeliverableType,
  url: string,
  keyword: string,
  onChunk: (chunk: string) => void
): Promise<string> {
  const response = await fetch('/api/seo-agent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, keyword, deliverableType: type }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    throw new Error(error?.error || `API error: ${response.status}`);
  }

  if (!response.body) {
    throw new Error('No response body received from API.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let fullText = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });

    if (chunk.includes('[STREAM_ERROR]')) {
      throw new Error(chunk);
    }

    fullText += chunk;
    onChunk(fullText); // sends live updates to the UI
  }

  return fullText;
}
