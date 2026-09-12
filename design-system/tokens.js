export const modes = {
  light: { canvas: '#F7F8FA', raised: '#FFFFFF', primary: '#20242C', secondary: '#5A6372', subtle: '#EDF0F4', border: '#737E90', accent: '#5145CD', soft: '#EEECFC', onAccent: '#FFFFFF', success: '#246343' },
  dark: { canvas: '#15171E', raised: '#1E222C', primary: '#F5F6FA', secondary: '#BAC1CE', subtle: '#292E3A', border: '#8590A3', accent: '#BCB4FF', soft: '#302B4C', onAccent: '#211A4A', success: '#90DDB1' },
  contrast: { canvas: '#000000', raised: '#000000', primary: '#FFFFFF', secondary: '#FFFFFF', subtle: '#171717', border: '#FFFFFF', accent: '#FFFF00', soft: '#171717', onAccent: '#000000', success: '#00FFAA' },
};
export const definitions = [
  ['surface.canvas', 'canvas', 'Page background', null, null],
  ['surface.raised', 'raised', 'Cards and elevated surfaces', null, null],
  ['text.primary', 'primary', 'Headings and body text', 'raised', 7],
  ['text.secondary', 'secondary', 'Supporting text and descriptions', 'raised', 4.5],
  ['interactive.default', 'accent', 'Primary actions and links', 'raised', 4.5],
  ['interactive.on-accent', 'onAccent', 'Text on primary actions', 'accent', 4.5],
  ['interactive.focus-ring', 'accent', 'Keyboard focus indicator', 'canvas', 3],
  ['border.default', 'border', 'Input and control boundaries', 'raised', 3],
  ['feedback.success', 'success', 'Positive status and validation', 'raised', 4.5],
];
export function contrast(a, b) {
  const lum = hex => {
    const c = hex.slice(1).match(/../g).map(v => parseInt(v, 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4);
    return c[0] * .2126 + c[1] * .7152 + c[2] * .0722;
  };
  const x = lum(a), y = lum(b);
  return (Math.max(x, y) + .05) / (Math.min(x, y) + .05);
}
export function exportTokens(mode) {
  const palette = modes[mode];
  const color = hex => ({ $type: 'color', $value: { colorSpace: 'srgb', components: hex.slice(1).match(/../g).map(c => parseInt(c, 16) / 255), alpha: 1 } });
  const semantic = {};
  for (const [name, key, description] of definitions) {
    const [group, leaf] = name.split('.');
    (semantic[group] ||= {})[leaf] = { $type: 'color', $value: `{primitive.${key}}`, $description: description };
  }
  return { $description: `Accessible Design System v0 — ${mode} mode. Contrast checks cover defined opaque color pairs only.`, primitive: Object.fromEntries(Object.entries(palette).map(([k, v]) => [k, color(v)])), semantic,
    component: { button: { background: { $type: 'color', $value: '{semantic.interactive.default}' }, label: { $type: 'color', $value: '{semantic.interactive.on-accent}' }, target: { $type: 'dimension', $value: { value: 2.75, unit: 'rem' } } }, chat: { focus: { $type: 'color', $value: '{semantic.interactive.focus-ring}' } } },
    typography: { body: { $type: 'dimension', $value: { value: 1, unit: 'rem' } }, lineHeight: { $type: 'number', $value: 1.5 } } };
}
