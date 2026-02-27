import { Link } from "react-router-dom";

import { Button } from "@/components/ui/button";

type Props = {
  homePath?: string;
};

export function NotFoundPage({ homePath = "/dashboard" }: Props) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 text-center">
      <div>
        <p className="text-6xl font-bold text-primary">404</p>
        <p className="mt-2 text-lg font-semibold">页面不存在</p>
        <p className="text-sm text-muted-foreground">
          页面可能已经被删除或地址输入有误。
        </p>
      </div>
      <div className="flex gap-3">
        <Button asChild>
          <Link to={homePath}>返回仪表盘</Link>
        </Button>
        <Button variant="ghost" asChild>
          <Link to="/login">重新登录</Link>
        </Button>
      </div>
    </div>
  );
}
