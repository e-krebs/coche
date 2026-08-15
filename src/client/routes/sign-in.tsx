import { createFileRoute, Navigate } from "@tanstack/react-router";
import { SignedOut, SignIn } from "@clerk/clerk-react";
import { useIdentity } from "client/store/identity";
import { useTranslation } from "client/i18n/useTranslation";

const SignInPage = () => {
  // Same cached-identity gate as "/": an offline user with a valid session reaches the app instead
  // of a blank page (Clerk renders nothing until isLoaded).
  const { status } = useIdentity();
  const t = useTranslation();

  if (status === "ready") return <Navigate to="/" />;

  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-6 p-6">
      {status === "loading" ? (
        <p className="text-muted">{t("loading")}</p>
      ) : (
        <SignedOut>
          <SignIn routing="hash" />
        </SignedOut>
      )}
    </div>
  );
};

export const Route = createFileRoute("/sign-in")({
  component: SignInPage,
});
