import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  fetchInstallerStatus,
  runInstaller
} from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuthStore } from "@/state/auth";

export function InstallerPage() {
  const queryClient = useQueryClient();
  const clearAuth = useAuthStore((state) => state.clear);
  const [step, setStep] = useState(1); // 1: 数据库配置, 2: 站点信息
  
  const { data, isLoading } = useQuery({
    queryKey: ["installer"],
    queryFn: fetchInstallerStatus
  });

  const [form, setForm] = useState({
    databaseType: "sqlite",
    databasePath: "storage/data/skyimage.db",
    databaseHost: "localhost",
    databasePort: "3306",
    databaseName: "skyimage",
    databaseUser: "root",
    databasePassword: "",
    siteName: "skyImage",
    adminName: "Administrator",
    adminEmail: "",
    adminPassword: ""
  });

  const mutation = useMutation({
    mutationFn: runInstaller,
    onSuccess: () => {
      clearAuth();
      toast.success("安装完成");
      queryClient.invalidateQueries({ queryKey: ["installer"] });
      window.location.href = "/login";
    },
    onError: (error) => toast.error(error.message)
  });

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">检测安装状态...</div>;
  }

  if (data?.installed) {
    return (
      <Card className="max-w-xl mx-auto mt-20">
        <CardHeader>
          <CardTitle>系统已安装</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p>版本：{data.version}</p>
          <Button onClick={() => (window.location.href = "/login")}>
            前往登录
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-10">
      <div>
        <h1 className="text-2xl font-semibold">安装程序</h1>
        <p className="text-muted-foreground">
          {step === 1 ? "第一步：配置数据库" : "第二步：配置站点信息"}
        </p>
      </div>
      
      {step === 1 ? (
        <Card>
          <CardHeader>
            <CardTitle>数据库配置</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="databaseType">数据库类型</Label>
              <Select
                value={form.databaseType}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, databaseType: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择数据库类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sqlite">SQLite（推荐）</SelectItem>
                  <SelectItem value="mysql">MySQL</SelectItem>
                  <SelectItem value="postgres">PostgreSQL</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {form.databaseType === "sqlite" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="databasePath">数据库文件路径</Label>
                  <Input
                    id="databasePath"
                    value={form.databasePath}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePath: e.target.value }))
                    }
                    placeholder="storage/data/skyimage.db"
                  />
                  <p className="text-sm text-muted-foreground">
                    SQLite 是一个轻量级的嵌入式数据库，无需额外配置，适合个人使用和小型项目。
                  </p>
                </div>
              </>
            )}

            {form.databaseType !== "sqlite" && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="databaseHost">数据库主机</Label>
                  <Input
                    id="databaseHost"
                    value={form.databaseHost}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseHost: e.target.value }))
                    }
                    placeholder="localhost"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databasePort">端口</Label>
                  <Input
                    id="databasePort"
                    value={form.databasePort}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePort: e.target.value }))
                    }
                    placeholder={form.databaseType === "postgres" ? "5432" : "3306"}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databaseName">数据库名称</Label>
                  <Input
                    id="databaseName"
                    value={form.databaseName}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseName: e.target.value }))
                    }
                    placeholder="skyimage"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databaseUser">用户名</Label>
                  <Input
                    id="databaseUser"
                    value={form.databaseUser}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databaseUser: e.target.value }))
                    }
                    placeholder="root"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="databasePassword">密码</Label>
                  <Input
                    id="databasePassword"
                    type="password"
                    value={form.databasePassword}
                    onChange={(e) =>
                      setForm((prev) => ({ ...prev, databasePassword: e.target.value }))
                    }
                  />
                </div>
              </>
            )}

            <Button
              className="w-full"
              onClick={() => setStep(2)}
            >
              下一步
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>站点信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">站点名称</Label>
              <Input
                id="siteName"
                value={form.siteName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, siteName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminName">管理员昵称</Label>
              <Input
                id="adminName"
                value={form.adminName}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminName: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminEmail">管理员邮箱</Label>
              <Input
                id="adminEmail"
                type="email"
                value={form.adminEmail}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, adminEmail: e.target.value }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="adminPassword">管理员密码(需大于等于8位)</Label>
              <Input
                id="adminPassword"
                type="password"
                value={form.adminPassword}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    adminPassword: e.target.value
                  }))
                }
              />
            </div>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="w-full"
                onClick={() => setStep(1)}
              >
                上一步
              </Button>
              <Button
                className="w-full"
                onClick={() => mutation.mutate(form)}
                disabled={mutation.isPending}
              >
                {mutation.isPending ? "正在安装..." : "立即安装"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
