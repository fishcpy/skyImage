import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useI18n } from "@/i18n";

export function ApiDocsPage() {
  const { t } = useI18n();
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">{t("apiDocs.title")}</h1>
        <p className="text-muted-foreground">{t("apiDocs.description")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{t("apiDocs.compatTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm">
          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.baseUrl")}</h3>
            <Badge variant="secondary" className="font-mono">{window.location.origin}/api/v1</Badge>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.auth")}</h3>
            <p className="text-muted-foreground mb-2">{t("apiDocs.authHint")}</p>
            <pre className="bg-muted p-3 rounded-md overflow-x-auto">
              <code>Authorization: Bearer YOUR_TOKEN_HERE</code>
            </pre>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.upload")}</h3>
            <p className="text-muted-foreground mb-2">
              <Badge variant="secondary">POST</Badge> <code>/api/v1/upload</code>
            </p>
            <p className="text-muted-foreground mb-2">{t("apiDocs.requestParams")}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><code>file</code> - {t("apiDocs.fileRequired")}</li>
              <li><code>strategy_id</code> - {t("apiDocs.strategyOptional")}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.profile")}</h3>
            <p className="text-muted-foreground mb-2">
              <Badge variant="secondary">GET</Badge> <code>/api/v1/profile</code>
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.strategies")}</h3>
            <p className="text-muted-foreground mb-2">
              <Badge variant="secondary">GET</Badge> <code>/api/v1/strategies</code>
            </p>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.images")}</h3>
            <p className="text-muted-foreground mb-2">
              <Badge variant="secondary">GET</Badge> <code>/api/v1/images</code>
            </p>
            <p className="text-muted-foreground mb-2">{t("apiDocs.queryParams")}</p>
            <ul className="list-disc list-inside text-muted-foreground space-y-1 ml-2">
              <li><code>page</code> - {t("apiDocs.pageOptional")}</li>
              <li><code>order</code> - {t("apiDocs.orderOptional")}</li>
              <li><code>keyword</code> - {t("apiDocs.keywordOptional")}</li>
            </ul>
          </div>

          <div>
            <h3 className="font-semibold mb-2">{t("apiDocs.delete")}</h3>
            <p className="text-muted-foreground mb-2">
              <Badge variant="secondary">DELETE</Badge> <code>/api/v1/images/:key</code>
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("apiDocs.nativeTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            {t("apiDocs.nativeAuth")} <Badge variant="secondary">POST /api/auth/login</Badge>
          </p>
          <p>
            {t("apiDocs.nativeUpload")} <Badge variant="secondary">POST /api/files</Badge>{t("apiDocs.nativeUploadSuffix")}<code>file</code> {t("legal.and")} <code>visibility</code>{t("legal.period")}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
