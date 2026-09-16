import { seg, fit } from '../tui/canvas.js';
import { box, listRows, sectionLabel } from '../tui/widgets.js';
import { allLessons } from '../content/index.js';

export default function renderPalette(app, w, h) {
  const t = app.theme;
  const query = app.state.paletteQuery || '';
  const history = app.state.paletteMode === 'history';
  
  // 1. Collect all searchable items
  const items = [];
  
  // Modules
  app.curriculum.forEach((mod, i) => {
    items.push({
      label: mod.title,
      type: 'module',
      index: i,
      search: `${mod.title} ${mod.id}`.toLowerCase(),
      marker: 'M',
      markerColor: 'secondary'
    });
    
    // Lessons
    mod.lessons.forEach((lesson, li) => {
      items.push({
        label: lesson.title,
        type: 'lesson',
        moduleIndex: i,
        lessonIndex: li,
        search: `${mod.title} ${lesson.title} ${lesson.id}`.toLowerCase(),
        marker: 'L',
        markerColor: 'accent'
      });
      
      // Challenges
      (lesson.challenges || []).forEach((ch, ci) => {
        items.push({
          label: `${lesson.title} > ${ch.id}`,
          type: 'challenge',
          moduleIndex: i,
          lessonIndex: li,
          challengeIndex: ci,
          search: `${mod.title} ${lesson.title} ${ch.id}`.toLowerCase(),
          marker: 'C',
          markerColor: 'star'
        });
      });
    });
  });

  // 2. Filter items based on query
  const filtered = items.filter(item => item.search.includes(query.toLowerCase()));
  
  // 3. Build the header row: a search box in jump mode, a fixed prompt in
  //    history mode (Q9 — checkpoints are a short list, not a search problem).
  const searchBar = fit([
    seg(history ? ' ⟲ ' : ' 🔍 ', { fg: t.accent, bg: t.panel }),
    seg(history ? 'Restore a checkpoint - Enter applies it' : (query || 'Type to search...'), { fg: t.text, bg: t.panel }),
    seg(' ', { bg: t.panel }),
    seg(' (ESC to close)', { fg: t.muted, bg: t.panel })
  ], w);

  // 4. Render the list
  const listH = h - 2;
  const results = listRows(t, w - 2, listH, filtered, app.state.cursor, {
    offset: app.state.paletteScroll || 0
  });

  const body = [
    ...results
  ];

  const rows = [
    searchBar,
    ...box(t, w, body, { title: history ? 'Checkpoints' : 'Quick Jump', focused: true, minHeight: listH })
  ];

  return rows;
}
