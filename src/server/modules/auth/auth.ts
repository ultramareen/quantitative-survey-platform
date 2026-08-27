import "server-only";

import { betterAuth } from "better-auth";

import { getServerEnvironment } from "@/server/config/env";
import { employeeAuthPlugin } from "./plugin";
import { getEmployeeAuthService } from "./runtime";

const environment = getServerEnvironment();

export const auth = betterAuth({
  appName: "Quantitative Survey Platform",
  baseURL: `${environment.APP_ORIGIN}/api/auth`,
  secret: environment.BETTER_AUTH_SECRET,
  trustedOrigins: [environment.APP_ORIGIN],
  emailAndPassword: { enabled: false },
  disabledPaths: ["/sign-up/email"],
  plugins: [
    employeeAuthPlugin({
      service: getEmployeeAuthService(),
      applicationOrigin: environment.APP_ORIGIN,
      environment: environment.APP_ENV,
    }),
  ],
});
