#!/usr/bin/env node
/**
 * SoryOS-Code CLI Adapter
 * Directly routes to the official @soryos/cli package.
 */

import { runCLI } from "@soryos/cli";

if (require.main === module) {
  runCLI().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

export { runCLI };
