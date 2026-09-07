/**
 * Minimal ambient types for `mapshaper`, which ships no `.d.ts` of its own and
 * has no `@types/mapshaper` package.
 *
 * Only `scripts/build-ionian-land.ts` uses it, and only for one call, so this
 * declares that one call rather than pretending to describe the whole library.
 * Widen it when a script actually needs more.
 */
declare module "mapshaper" {
  /**
   * Run a mapshaper command string over an in-memory virtual filesystem.
   *
   * `input` maps a filename used in the command (e.g. `-i in.geojson`) to its
   * contents; the resolved object maps each `-o` filename to its output. Text
   * formats such as GeoJSON come back as strings, binary ones as buffers.
   */
  export function applyCommands(
    commands: string,
    input: Record<string, string | Uint8Array>,
  ): Promise<Record<string, string | Uint8Array>>;

  const mapshaper: {
    applyCommands: typeof applyCommands;
  };

  export default mapshaper;
}
