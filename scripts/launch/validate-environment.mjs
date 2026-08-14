import { environmentTargets, validateEnvironment } from "./environment-contract.mjs";
const argument = process.argv.find((item) => item.startsWith("--target="));
const target = argument?.split("=")[1] ?? "all";
const targets = target === "all" ? Object.keys(environmentTargets) : [target];
let failed = false;
for (const name of targets) {
  const errors = validateEnvironment(name, process.env);
  if (errors.length) {
    failed = true;
    console.error(`${name}: FAILED`);
    for (const error of errors) console.error(`  - ${error}`);
  } else console.log(`${name}: configuration contract passed`);
}
if (failed) process.exitCode = 1;
