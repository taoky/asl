export type LangKey = 'romaji' | 'ja' | 'zh-jp' | 'zh';

export interface Song {
  id: string;  // romaji ID
  title: string;
}

export const songs: Song[] = [
  { id: 'hanayuki', title: '花雪' },
  { id: 'masterpiece', title: 'M@STERPIECE' },
  { id: 'contrast', title: 'Contrast' },
];
