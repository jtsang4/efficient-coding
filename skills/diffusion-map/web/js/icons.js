import { html } from "htm/preact";

const Svg = ({ children }) => html`<svg viewBox="0 0 24 24" aria-hidden="true">${children}</svg>`;

export const IconSearch = () => html`<${Svg}><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /><//>`;
export const IconOutline = () => html`<${Svg}><path d="M4 6h3M10 6h10M7 12h3M13 12h7M10 18h3M16 18h4" /><//>`;
export const IconLegend = () => html`<${Svg}><circle cx="7" cy="8" r="2.6" fill="currentColor" /><circle cx="17" cy="8" r="2.6" /><circle cx="12" cy="16.5" r="2.6" stroke-dasharray="1.6 1.6" /><//>`;
export const IconFit = () => html`<${Svg}><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /><//>`;
export const IconSun = () =>
  html`<${Svg}><circle cx="12" cy="12" r="4" /><path d="M12 2.5v2M12 19.5v2M4.6 4.6 6 6M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" /><//>`;
export const IconMoon = () => html`<${Svg}><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /><//>`;
export const IconAuto = () => html`<${Svg}><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" /><//>`;
export const IconClose = () => html`<${Svg}><path d="M6 6l12 12M18 6 6 18" /><//>`;
export const IconPlay = () => html`<${Svg}><path d="M8 5.5v13l10.5-6.5Z" /><//>`;
export const IconPause = () => html`<${Svg}><path d="M8.5 5.5v13M15.5 5.5v13" /><//>`;
export const IconGlobe = () =>
  html`<${Svg}><circle cx="12" cy="12" r="8.5" /><path d="M3.5 12h17M12 3.5c2.4 2.4 3.6 5.2 3.6 8.5s-1.2 6.1-3.6 8.5c-2.4-2.4-3.6-5.2-3.6-8.5S9.6 5.9 12 3.5Z" /><//>`;
export const IconCheck = () => html`<${Svg}><path d="m5 12.5 4.5 4.5L19 7.5" /><//>`;
export const IconTrash = () =>
  html`<${Svg}><path d="M4.5 7h15M10 7V4.8h4V7M6.5 7l.9 12.2h9.2L17.5 7M10.2 10.5v5.5M13.8 10.5v5.5" /><//>`;
export const IconBack = () => html`<${Svg}><path d="M14.5 6 8.5 12l6 6" /><//>`;
