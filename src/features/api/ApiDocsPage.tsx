import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

export function ApiDocsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">开放接口</h1>
        <p className="text-muted-foreground">使用 API 将上传流程接入到你的脚本或自动化工具。</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>REST 接口说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm text-muted-foreground">
          <p>
            目前共用同一套 JWT 鉴权机制。获取 token：<Badge variant="secondary">POST /api/auth/login</Badge>
          </p>
          <p>
            上传文件：<Badge variant="secondary">POST /api/files</Badge>，支持表单字段{" "}
            <code>file</code> 与 <code>visibility</code>。
          </p>
          <p>更多高级操作（策略、审核等）会在后续版本公布。</p>
        </CardContent>
      </Card>
    </div>
  );
}
