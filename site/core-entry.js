// Public API from the registry release pinned in site/package-lock.json.
// Do not substitute ../src: visitors must get what they can install.
export { AirCursorEngine, VirtualPointer, cropRegion, DEFAULT_OPTIONS } from 'air-cursor';
import { version } from 'air-cursor/package.json';
export const DEMO_PACKAGE = { name: 'air-cursor', version, source: 'npm' };
