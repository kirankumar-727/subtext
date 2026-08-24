import {
  ENVIRONMENT_MODE_VARIABLE,
  environmentTargets,
  validateEnvironment,
  validateEnvironmentMode,
} from "./environment-contract.mjs";

const argument = process.argv.find((item) => item.startsWith("--target="));
const target = argument?.split("=")[1] ?? "all";
const mode = process.env[ENVIRONMENT_MODE_VARIABLE];
const modeErrors = validateEnvironmentMode(mode);

if (modeErrors.length) {
  console.error("environment: FAILED");
  for (const error of modeErrors) console.error(`  - ${error}`);
  process.exitCode = 1;
} else {
  const targets = target === "all" ? Object.keys(environmentTargets) : [target];
  let failed = false;
  for (const name of targets) {
    const errors = validateEnvironment(name, process.env);
    if (errors.length) {
      failed = true;
      console.error(`${name}: FAILED`);
      for (const error of errors) console.error(`  - ${error}`);
    } else console.log(`${name}: ${mode.trim()} configuration contract passed`);
  }
  if (failed) process.exitCode = 1;
}
