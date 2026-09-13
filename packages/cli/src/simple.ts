#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

// Legacy simple mode - replaced by the new yargs-based CLI
const argv = hideBin(process.argv)

async function main() {
  console.error("\n\nWarning: The simple CLI mode is deprecated. Please use the new CLI instead.\n\n");
  console.error("The new CLI uses yargs for better command-line parsing and is available via 'mottainai <command>'.\n");
  console.error("Run 'mottainai --help' for available commands.\n");
  
  const cli = yargs(argv)
    .usage("mottainai")
    .help("help", "show help")
    .alias("help", "h")
    .version("0.1.0", "version", "show version number")
    .alias("version", "v")
    .demandCommand(1, "You need to specify a command")
    .strict()
  
  try {
    await cli.parse()
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

main().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})