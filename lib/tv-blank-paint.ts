/** First-paint background — never default browser white on signage hardware. */
export const TV_BLANK_PAINT_BG = "#12333f";

export const TV_BLANK_PAINT_CRITICAL_CSS = `html,body{background-color:${TV_BLANK_PAINT_BG}!important;min-height:100%;}`;
