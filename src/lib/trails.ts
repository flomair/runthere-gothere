import { api } from './api';
import type { TrailRoute, TrailSearchResult } from './types';

export interface TrailRecommendation {
  name: string;
  /** What to search for on Waymarked Trails / OpenStreetMap. */
  query: string;
  region: string;
  /** Approximate length of the main route in km. */
  km: number;
  blurb: string;
  /** Load the relation reversed to walk it in the traditional direction. */
  reverse?: boolean;
}

export interface TrailCategory {
  title: string;
  subtitle: string;
  trails: TrailRecommendation[];
}

/** Hand-picked classics, grouped by how long they take a runner. Lengths are approximate. */
export const TRAIL_RECOMMENDATIONS: TrailCategory[] = [
  {
    title: 'Weekend-sized',
    subtitle: 'Under 200 km: a few weeks of regular running',
    trails: [
      { name: 'Malerweg', query: 'Malerweg', region: 'Saxon Switzerland, DE', km: 116, blurb: 'Sandstone towers, gorges and the Bastei bridge above the Elbe.' },
      { name: "Hadrian's Wall Path", query: "Hadrian's Wall Path", region: 'England, UK', km: 135, blurb: 'Coast to coast along the Roman frontier.' },
      { name: 'West Highland Way', query: 'West Highland Way', region: 'Scotland, UK', km: 154, blurb: 'From Milngavie past Loch Lomond and Glencoe to Fort William.' },
      { name: 'Rennsteig', query: 'Rennsteig', region: 'Thuringia, DE', km: 170, blurb: "Germany's classic ridge path through the Thuringian Forest." },
      { name: 'Tour du Mont Blanc', query: 'Tour du Mont Blanc', region: 'FR · IT · CH', km: 170, blurb: 'A loop around the Mont Blanc massif through three countries.' },
      { name: 'GR 20', query: 'GR 20', region: 'Corsica, FR', km: 180, blurb: "Often called Europe's toughest trail: granite ridges across Corsica." },
    ],
  },
  {
    title: 'A season of running',
    subtitle: '200–800 km',
    trails: [
      { name: 'Westweg', query: 'Westweg', region: 'Black Forest, DE', km: 285, blurb: 'Pforzheim to Basel over Feldberg and Belchen.' },
      { name: 'Adlerweg', query: 'Adlerweg', region: 'Tyrol, AT', km: 413, blurb: 'The "Eagle Walk" across the Tyrolean Alps.' },
      { name: 'Kungsleden', query: 'Kungsleden', region: 'Lapland, SE', km: 440, blurb: "The King's Trail through Arctic Sweden." },
      { name: 'E5 Oberstdorf → Meran', query: 'E5', region: 'DE · AT · IT', km: 600, blurb: 'The classic Alpine crossing on the European long-distance path E5. Pick the section you want in the results.' },
      { name: 'Camino Portugués', query: 'Camino Portugués', region: 'PT · ES', km: 620, blurb: 'Lisbon via Porto to Santiago de Compostela.' },
      { name: 'Camino Francés', query: 'Camino Francés', region: 'FR · ES', km: 780, blurb: 'The best-known Way of St. James, from the Pyrenees to Santiago.' },
    ],
  },
  {
    title: 'Epic journeys',
    subtitle: '800 km and more: a year or longer',
    trails: [
      { name: 'Via Francigena', query: 'Via Francigena', region: 'UK · FR · CH · IT', km: 2000, blurb: 'The medieval pilgrims’ road from Canterbury to Rome.' },
      { name: 'Via Alpina (Red Trail)', query: 'Via Alpina Red', region: '8 Alpine countries', km: 2600, blurb: 'Trieste to Monaco through the whole Alpine arc.' },
      { name: 'Te Araroa', query: 'Te Araroa', region: 'New Zealand', km: 3000, blurb: 'Cape Reinga to Bluff, the length of New Zealand.' },
      { name: 'Appalachian Trail', query: 'Appalachian Trail', region: 'USA', km: 3500, blurb: 'Georgia to Maine along the Appalachian Mountains.' },
      { name: 'Pacific Crest Trail', query: 'Pacific Crest Trail', region: 'USA', km: 4270, blurb: 'Mexico to Canada through deserts, the Sierra Nevada and the Cascades.' },
    ],
  },
];

export const searchTrails = (q: string) =>
  api<{ results: TrailSearchResult[] }>(`/api/trails/search?q=${encodeURIComponent(q)}`).then((r) => r.results);

export const loadTrailRoute = (osmId: number, reverse: boolean) =>
  api<TrailRoute>(`/api/trails/route?id=${osmId}${reverse ? '&reverse=1' : ''}`);
