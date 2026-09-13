#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"

const argv = hideBin(process.argv)

// Handle global flags before yargs parses commands
if (argv.includes("--version") || argv.includes("-v")) {
  console.log("0.1.0")
  process.exit(0)
}

if (argv.includes("--help") || argv.includes("-h")) {
  // yargs will handle this after we parse
}

async function run() {
  const { RunCommand } = await import("./app")

  const cli = yargs(argv)
    .usage("Usage: mottainai [options]")
    .help("help", "show help")
    .alias("help", "h")
    .version("0.1.0", "version", "show version number")
    .alias("version", "v")
    .command(RunCommand)

  try {
    await cli.parse()
  } catch (error) {
    console.error("Error:", error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}

run().catch((error) => {
  console.error("Fatal error:", error instanceof Error ? error.message : String(error))
  process.exit(1)
})