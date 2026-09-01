export function getSignInNotice(reason: string | undefined) {
  return reason === "password-reset"
    ? "Password updated. Sign in with your new password."
    : undefined;
}
