import "./style.css";
import { songs } from "./songs";
import type { Song, LangKey } from "./songs";

const LANGS: { key: LangKey; label: string }[] = [
  { key: "ja", label: "日语" },
  { key: "romaji", label: "罗马音" },
  { key: "zh", label: "中文" },
  { key: "zh-jp", label: "中文（日语语序）" },
];

type TagKey = LangKey | "all";
type Row = Partial<Record<TagKey, string>>;
type PerSongCache = Row[];

const app = document.querySelector<HTMLDivElement>("#app")!;
let currentSongId: string | null = null;
let selectedLangs = new Set<LangKey>(["ja", "romaji", "zh"]);
const lyricsCache = new Map<string, PerSongCache>();
const songBtnMap = new Map<string, HTMLButtonElement>();
const toggleInputMap = new Map<LangKey, HTMLInputElement>();

// UI 根结构
const topbar = el("div", "topbar", "Anisong Lyrics Viewer");
const container = el("div", "container");
const sidebar = el("aside", "sidebar");
const main = el("main", "main");

app.append(topbar, container);
container.append(sidebar, main);

// 侧栏：列表
const listTitle = el("h2", undefined, "歌曲列表");
const songList = el("ul", "song-list");
sidebar.append(listTitle, songList);

// 主区：标题 + 开关 + 歌词
const headerLine = el("div", "header-line");
const headerTitle = el("div", "header-title", "请选择一首歌曲");

const toggles = el("div", "toggles");
const lyricsWrap = el("div", "lyrics-wrap");
lyricsWrap.append(el("div", "empty", "未选择歌曲"));

main.append(headerLine, toggles, lyricsWrap);

// 渲染歌曲列表
for (const s of songs) {
  const li = document.createElement("li");
  const btn = document.createElement("button");
  btn.className = "song-btn";
  btn.type = "button";
  btn.textContent = `${s.id} (${s.title})`;
  btn.addEventListener("click", () => selectSong(s));
  li.append(btn);
  songList.append(li);
  songBtnMap.set(s.id, btn);
}

// 渲染语言开关
for (const { key, label } of LANGS) {
  const chip = el("label", "toggle-chip");
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = selectedLangs.has(key);
  input.addEventListener("change", () => {
    if (input.checked) selectedLangs.add(key);
    else selectedLangs.delete(key);
    renderLyrics();
  });
  toggleInputMap.set(key, input);
  chip.append(input, document.createTextNode(label));
  toggles.append(chip);
}

function getSongFromHash(): Song | null {
  const h = location.hash;
  if (!h || h.length <= 1) return null;
  const id = decodeURIComponent(h.slice(1));
  return songs.find(s => s.id === id) ?? null;
}

const fromHash = getSongFromHash();
if (fromHash) selectSong(fromHash);
else if (songs[0]) selectSong(songs[0]);

// 监听 hash 变化（前进/后退或手动修改）
window.addEventListener('hashchange', () => {
  const s = getSongFromHash();
  if (s && s.id !== currentSongId) {
    selectSong(s);
  }
});

function parseTaggedLyrics(text: string): PerSongCache {
  const norm = text.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n");
  const lines = norm.split("\n");

  const rows: Row[] = [];
  let row: Row = {};
  let last: TagKey | null = null;

  const mapTag = (t: string): TagKey | null => {
    const s = t.trim().toLowerCase();
    if (s === "ja" || s === "jp" || s === "jpn") return "ja";
    if (s === "zh-jp" || s === "zhjp" || s === "zhjpn") return "zh-jp";
    if (s === "romaji" || s === "roma" || s === "rom") return "romaji";
    if (s === "zh" || s === "cn" || s === "chs" || s === "cht" || s === "zhs")
      return "zh";
    if (s === "all" || s === "any" || s === "*") return "all";
    return null;
  };

  const pushRowIfAny = () => {
    if (Object.keys(row).length) {
      rows.push(row);
      row = {};
    }
    last = null;
  };

  for (const raw of lines) {
    const line = raw.trimEnd(); // 保持左侧 tag 匹配，右侧保留必要空格
    if (line.trim() === "") {
      pushRowIfAny();
      continue;
    }
    const m = line.match(/^\[([^\]]+)\]\s*(.*)$/);
    if (m) {
      const key = mapTag(m[1]);
      if (!key) {
        last = null;
        continue;
      }
      const content = m[2] ?? "";
      row[key] = row[key] ? row[key]! + "\n" + content : content;
      last = key;
    } else if (last) {
      row[last] = row[last] ? row[last]! + "\n" + line : line;
    }
  }
  pushRowIfAny();

  return rows;
}

// 选择歌曲
async function selectSong(song: Song) {
  if (currentSongId === song.id) return;
  currentSongId = song.id;

  const hashId = "#" + encodeURIComponent(song.id);
  if (location.hash !== hashId) {
    location.hash = hashId;
  }

  // 高亮列表项
  for (const [id, btn] of songBtnMap) {
    btn.classList.toggle("active", id === song.id);
  }

  // 更新标题
  headerTitle.textContent = song.title;

  // 加载歌词
  if (!lyricsCache.has(song.id)) {
    lyricsWrap.innerHTML = "";
    lyricsWrap.append(el("div", "loading", "正在加载歌词…"));

    const text = await fetchText(`/lyrics/${song.id}`);
    const rows = parseTaggedLyrics(text ?? "");
    lyricsCache.set(song.id, rows);
  }

  // 根据可用性更新开关禁用态
  updateToggleAvailability();
  renderLyrics();
}

// 更新语言开关的可用状态（当前歌曲）
function updateToggleAvailability() {
  if (!currentSongId) return;
  const rows = lyricsCache.get(currentSongId)!;
  for (const { key } of LANGS) {
    const has = rows.some((r) => (r[key]?.trim()?.length ?? 0) > 0);
    const input = toggleInputMap.get(key)!;
    input.disabled = !has;
    input.parentElement?.classList.toggle("disabled", !has);
  }
}

// 渲染歌词区域
function renderLyrics() {
  if (!currentSongId) return;
  const rows = lyricsCache.get(currentSongId)!;

  lyricsWrap.innerHTML = "";

  // 选中的且在本歌中确有内容的语言
  const activeKeys = LANGS.map((l) => l.key)
    .filter((k) => selectedLangs.has(k))
    .filter((k) =>
      rows.some((r) => (r[k]?.trim()?.length ?? 0) > 0)
    ) as LangKey[];

  if (activeKeys.length === 0) {
    lyricsWrap.append(
      el("div", "empty", "该歌曲没有所选语言内容（或未选择语言）")
    );
    return;
  }

  const frag = document.createDocumentFragment();

  for (const r of rows) {
    const line = el("div", "line");
    let count = 0;

    // 先输出选中语言在该句中的内容
    for (const k of activeKeys) {
      const t = r[k]?.trim();
      if (t) {
        line.append(el("div", `cell ${k}`, t));
        count++;
      }
    }

    // 若该句没有任一选中语言，但有 [all]，则回退输出 [all]（只输出一次）
    if (count === 0) {
      const allText = r.all?.trim();
      if (allText && selectedLangs.size > 0) {
        line.append(el("div", "cell all", allText));
        count = 1;
      }
    }

    if (count > 0) frag.append(line);
  }

  if (!frag.childNodes.length) {
    lyricsWrap.append(
      el("div", "empty", "该歌曲没有所选语言内容（或未选择语言）")
    );
  } else {
    lyricsWrap.append(frag);
  }
}

// 工具函数
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string
) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  if (className === "cell ja") {
    node.lang = "ja";
  } else if (className === "cell zh" || className === "cell zh-jp") {
    node.lang = "zh";
  }
  return node;
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}
