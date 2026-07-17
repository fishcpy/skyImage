import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { fetchOAuthProviders, getOAuthStartUrl } from "@/lib/api";
import { useI18n } from "@/i18n";

export function OAuthButtons({ className }: { className?: string }) {
  const { t } = useI18n();
  const { data: providers } = useQuery({
    queryKey: ["oauth-providers"],
    queryFn: fetchOAuthProviders,
    staleTime: 0,
    refetchOnMount: "always"
  });

  if (!providers?.length) {
    return null;
  }

  return (
    <div className={className}>
      <div className="relative my-4">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-card px-2 text-muted-foreground">{t("oauth.orContinueWith")}</span>
        </div>
      </div>
      <div className="grid gap-2">
        {providers.map((p) => (
          <Button
            key={p.id}
            type="button"
            variant="outline"
            className="w-full"
            onClick={() => {
              window.location.href = getOAuthStartUrl(p.id);
            }}
          >
            {t("oauth.continueWith", { name: p.name })}
          </Button>
        ))}
      </div>
    </div>
  );
}
