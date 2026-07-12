import { basename } from "node:path";
import { parseProfileFile, emitDesignMd } from "../src/index.js";

const profilePath = process.argv[2];
if (!profilePath) {
  console.error("Usage: tsx scripts/emit-design-md.ts <profile.yaml>");
  process.exit(1);
}

const profile = parseProfileFile(profilePath);
const body = emitDesignMd(profile);

// Provenance header, sourced only from the CLI arg (never a clock call) so
// re-running the same command byte-reproduces the same output.
const header = `<!-- GENERATED — produced by packages/cdf-core/scripts/emit-design-md.ts from
     ${basename(profilePath)} via emitDesignMd(). Profile-only emit (no
     opts.tokens): Colors/Typography/Layout/Elevation/Shapes are omitted
     (semantic vocabularies, not literal token values). Do not hand-edit;
     regenerate from the Profile instead. -->\n\n`;

process.stdout.write(header + body);
