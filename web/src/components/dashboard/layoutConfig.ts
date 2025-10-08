// Centralized layout configuration. Adjust values here.
export const LayoutConfig = {
  // Master scale
  CHART_SCALE: 1.0, // vertical multiplier (recommended 0.6 - 1.6)

  // Chart geometry
  GRAPH_HEIGHT: 220, // base chart (price+volume) visual height before scale
  GRAPH_WIDTH: 1080, // logical SVG coordinate width
  CHART_PANEL_MIN_HEIGHT: 140, // min chart panel height baseline (scaled)

  // Grid / container
  GRID_GAP: 10, // gap between main chart column and right column
  RIGHT_COLUMN_WIDTH: 380, // width of right analytics column
  RIGHT_COLUMN_HEIGHT: undefined as number | undefined, // set a number to force scroll within column
  RIGHT_GAP_PX: 0, // extra padding at far right edge
  HEIGHT: "94%", // overall dashboard height (e.g. '100%', '85vh')

  // Right panel spacing
  OVERVIEW_NEWS_GAP: 0, // vertical gap between overview and news panels
  RIGHTPANEL_OVERVIEW_GAP: 32, // gap between overview mini info items
  OVERVIEW_COLLAPSED_MAX_HEIGHT: 150, // collapsed overview text max height baseline
  STATS_PANEL_HEIGHT: undefined as number | undefined, // fixed stats header height (optional)
  OVERVIEW_GROUP_ITEM_GAP: 30, // gap between items within a group
  OVERVIEW_GROUPS_GAP: 10, // gap between groups
  OVERVIEW_URL_GAP: 0, // gap before URL block
  OVERVIEW_LABEL_FONT_SIZE: 10, // font size for overview labels
  OVERVIEW_VALUE_FONT_SIZE: 10, // font size for overview values
  OVERVIEW_URL_INTERNAL_GAP: 0, // vertical gap inside URL block between placeholder and value
  OVERVIEW_COLLAPSED_SENTENCES: 1, // how many sentences to show when collapsed
  OVERVIEW_WORD_LIMIT: 15, // number of words to show in collapsed overview

  // Stats header typography
  STATS_HEADER_NAME_FONT_SIZE: 14,
  STATS_HEADER_SYMBOL_FONT_SIZE: 14, // set same as name for alignment
  STATS_HEADER_SYMBOL_FONT_FAMILY: "ui-monospace,monospace",
  STATS_HEADER_BULLET_COLOR_OPACITY: 0.9,
  STATS_HEADER_BULLET_NUDGE_Y: -1, // px translateY to vertically center the bullet

  // News sizing
  NEWS_VISIBLE_ARTICLES: 3, // number of article rows visible before scrolling
  NEWS_ARTICLE_ROW_HEIGHT: 54, // approximate per-article row height
  // Axis / label typography
  AXIS_Y_FONT_SIZE: 10,
  AXIS_X_FONT_SIZE: 10,
  AXIS_RIGHT_GUTTER: 70,
  AXIS_FOOTER_HEIGHT: 16,
  AXIS_Y_LABEL_X_OFFSET: 4,
  LAST_PRICE_LABEL_WIDTH: 50,
  LAST_PRICE_LABEL_HEIGHT: 12,
  LAST_PRICE_LABEL_FONT_SIZE: 10,
  INDICATOR_LABEL_WIDTH: 50, // width for indicator labels (EMA20, BB)
  INDICATOR_LABEL_HEIGHT: 12, // height for indicator labels
  INDICATOR_LABEL_FONT_SIZE: 9, // font size for indicator labels
};
