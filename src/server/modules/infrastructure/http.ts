import "server-only";

import {
  managementError,
  requireTrustedMutation,
} from "@/server/modules/employees/http";
export { managementError as infrastructureError, requireTrustedMutation };
