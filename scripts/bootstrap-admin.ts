import nextEnvironment from "@next/env";

nextEnvironment.loadEnvConfig(process.cwd());

const { bootstrapInitialAdmin } =
  await import("../src/server/modules/auth/bootstrap");

const email = process.env.QSP_BOOTSTRAP_EMAIL;
const displayName = process.env.QSP_BOOTSTRAP_DISPLAY_NAME;
const password = process.env.QSP_BOOTSTRAP_PASSWORD;

if (!email || !displayName || !password) {
  throw new Error(
    "Set QSP_BOOTSTRAP_EMAIL, QSP_BOOTSTRAP_DISPLAY_NAME, and QSP_BOOTSTRAP_PASSWORD for this one command.",
  );
}

const { userId } = await bootstrapInitialAdmin({
  email,
  displayName,
  password,
});

process.stdout.write(`Initial administrator created: ${userId}\n`);
