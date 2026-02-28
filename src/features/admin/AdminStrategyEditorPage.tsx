import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  fetchGroups,
  fetchStrategies,
  saveStrategy,
  type GroupRecord,
  type StrategyRecord
} from "@/lib/api";

const driverOptions = [
  { key: "local", label: "本地储存" }
];

export function AdminStrategyEditorPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: strategies } = useQuery({
    queryKey: ["admin", "strategies"],
    queryFn: fetchStrategies
  });
  const { data: groups } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });

  const [form, setForm] = useState<Partial<StrategyRecord>>({
    key: 1,
    name: "",
    intro: "",
    configs: {
      driver: "local",
      root: "storage/uploads",
      url: "",
      path_template: "{year}/{month}/{day}/{uuid}"
    }
  });
  const [selectedGroups, setSelectedGroups] = useState<number[]>([]);

  useEffect(() => {
    if (isEditing && strategies) {
      const target = strategies.find((item) => item.id === Number(id));
      if (target) {
        const allowedExtensions =
          target.configs?.allowed_extensions ||
          target.configs?.allowed_exts ||
          target.configs?.extensions ||
          target.configs?.allowedExtensions ||
          "";
        const pathTemplate =
          target.configs?.path_template ||
          target.configs?.pattern ||
          "{year}/{month}/{day}/{uuid}";
        setForm({
          ...target,
          configs: {
            driver: target.configs?.driver || "local",
            root: target.configs?.root || "storage/uploads",
            url:
              target.configs?.url ||
              target.configs?.base_url ||
              target.configs?.baseUrl ||
              "",
            allowed_extensions: allowedExtensions,
            path_template: pathTemplate
          }
        });
        setSelectedGroups(target.groups?.map((group) => group.id) || []);
      }
    } else if (!isEditing) {
      setForm({
        key: 1,
        name: "",
        intro: "",
        configs: {
          driver: "local",
          root: "storage/uploads",
          url: "",
          allowed_extensions: "",
          path_template: "{year}/{month}/{day}/{uuid}"
        }
      });
      setSelectedGroups([]);
    }
  }, [id, isEditing, strategies]);

  const saveMutation = useMutation({
    mutationFn: saveStrategy,
    onSuccess: () => {
      toast.success("策略已保存");
      queryClient.invalidateQueries({ queryKey: ["admin", "strategies"] });
      navigate("/dashboard/admin/strategies");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleSave = () => {
    if (!form.name) return;
    const template = (form.configs as any)?.path_template || "{year}/{month}/{day}/{uuid}";
    if (template && !String(template).includes("{uuid}")) {
      toast.error("路径模板必须包含 {uuid} 以确保唯一性");
      return;
    }
    saveMutation.mutate({
      ...form,
      groupIds: selectedGroups,
      configs: {
        ...form.configs,
        url:
          form.configs?.url ||
          form.configs?.base_url ||
          form.configs?.baseUrl ||
          "",
        base_url:
          form.configs?.url ||
          form.configs?.base_url ||
          form.configs?.baseUrl ||
          "",
        allowed_extensions: form.configs?.allowed_extensions || "",
        path_template: form.configs?.path_template || "{year}/{month}/{day}/{uuid}",
        pattern: form.configs?.path_template || "{year}/{month}/{day}/{uuid}"
      }
    } as StrategyRecord);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary" to="/dashboard/admin/strategies">
            储存策略
          </Link>{" "}
          / {isEditing ? "编辑策略" : "新增策略"}
        </p>
        <h1 className="text-2xl font-semibold">{isEditing ? form.name : "新建策略"}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>策略配置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>策略名称</Label>
              <Input
                value={form.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>驱动类型</Label>
              <Select
                value={form.configs?.driver || "local"}
                onValueChange={(value) =>
                  setForm((prev) => ({ ...prev, configs: { ...prev.configs, driver: value } }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="选择驱动" />
                </SelectTrigger>
                <SelectContent>
                  {driverOptions.map((option) => (
                    <SelectItem key={option.key} value={option.key}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>简介（可选）</Label>
            <Input
              value={form.intro || ""}
              onChange={(e) => setForm((prev) => ({ ...prev, intro: e.target.value }))}
            />
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>储存根路径</Label>
              <Input
                value={form.configs?.root || ""}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, configs: { ...prev.configs, root: e.target.value } }))
                }
              />
              <p className="text-xs text-muted-foreground">确保该路径具有读写权限。</p>
            </div>
            <div className="space-y-2">
              <Label>外部访问域名</Label>
              <Input
                value={form.configs?.url || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    configs: { ...prev.configs, url: e.target.value }
                  }))
                }
                placeholder="https://cdn.example.com"
              />
              <p className="text-xs text-muted-foreground">
                仅允许填写域名（不含路径），路径由“路径模板”控制，可为空。
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>允许上传后缀（可选）</Label>
            <Input
              value={(form.configs as any)?.allowed_extensions || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  configs: { ...prev.configs, allowed_extensions: e.target.value }
                }))
              }
              placeholder="jpg,png,webp,mp4"
            />
            <p className="text-xs text-muted-foreground">使用英文逗号分隔，留空表示不限制。</p>
          </div>
          <div className="space-y-2">
            <Label>路径模板</Label>
            <Input
              value={(form.configs as any)?.path_template || ""}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  configs: { ...prev.configs, path_template: e.target.value }
                }))
              }
              placeholder="{year}/{month}/{day}/{uuid}"
            />
            <p className="text-xs text-muted-foreground">
              可用变量：{`{year}`}/{`{month}`}/{`{day}`}/{`{hour}`}/{`{minute}`}/{`{second}`}/
              {`{unix}`}/{`{uuid}`}/{`{userId}`}/{`{userName}`}/{`{original}`}/{`{ext}`}/
              {`{rand6}`}（例如：{`{original}`}/{`{rand6}`}）。不包含 {`{ext}`} 将自动追加后缀。
            </p>
          </div>
          <div className="space-y-2">
            <Label>授权角色组</Label>
            <div className="space-y-3">
              {groups?.map((group) => (
                <div
                  key={group.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {group.name}
                      {group.isDefault && (
                        <span className="ml-2 text-xs text-muted-foreground">· 默认</span>
                      )}
                    </p>
                  </div>
                  <Checkbox
                    id={`group-${group.id}`}
                    checked={selectedGroups.includes(group.id)}
                    onCheckedChange={(checked) => {
                      const actualValue = checked === 'indeterminate' ? false : checked;
                      if (actualValue) {
                        setSelectedGroups((prev) => [...prev, group.id]);
                      } else {
                        setSelectedGroups((prev) => prev.filter((id) => id !== group.id));
                      }
                    }}
                  />
                </div>
              ))}
              {!groups?.length && (
                <p className="text-sm text-muted-foreground">暂无角色组，请先创建。</p>
              )}
            </div>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSave} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中..." : "保存策略"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard/admin/strategies")}
              disabled={saveMutation.isPending}
            >
              取消
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
