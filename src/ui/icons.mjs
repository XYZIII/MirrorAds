/** Line icons for the rail and the top bar. They inherit the text color. */
const icon = (body) =>
  `<svg class="ma-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  clone: icon(
    '<rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2.5"/><path d="M15.5 8.5V6.5A2.5 2.5 0 0 0 13 4H6.5A2.5 2.5 0 0 0 4 6.5V13a2.5 2.5 0 0 0 2.5 2.5h2"/>',
  ),
  export: icon(
    '<path d="M12 15V4"/><path d="m7.5 8.5 4.5-4.5 4.5 4.5"/><path d="M4.5 14.5v3A2.5 2.5 0 0 0 7 20h10a2.5 2.5 0 0 0 2.5-2.5v-3"/>',
  ),
  log: icon('<path d="M5 6.5h14"/><path d="M5 12h14"/><path d="M5 17.5h9"/>'),
  refresh: icon(
    '<path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M19.5 4.5v4.2h-4.2"/>',
  ),
  settings: icon(
    '<path d="M5 7h7"/><path d="M16 7h3"/><circle cx="14" cy="7" r="2"/><path d="M5 17h3"/><path d="M12 17h7"/><circle cx="10" cy="17" r="2"/>',
  ),
  minimize: icon('<path d="M6 18h12"/>'),
  close: icon('<path d="m6.5 6.5 11 11"/><path d="m17.5 6.5-11 11"/>'),
};
