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
  { key: "local", label: "本地储存" },
  { key: "webdav", label: "WebDAV" },
  { key: "ftp", label: "FTP" },
  { key: "s3", label: "S3 兼容存储" }
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
        webdav_endpoint: "",
        webdav_username: "",
        webdav_password: "",
        webdav_base_path: "",
        webdav_skip_tls_verify: false,
        ftp_host: "",
        ftp_port: 21,
        ftp_username: "",
        ftp_password: "",
        ftp_base_path: "",
        ftp_tls: false,
        ftp_skip_tls_verify: false,
        ftp_timeout: 15,
        s3_endpoint: "",
        s3_region: "",
        s3_bucket: "",
        s3_access_key: "",
      s3_secret_key: "",
      s3_session_token: "",
      s3_force_path_style: false,
      proxy: false,
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
            webdav_endpoint:
              target.configs?.webdav_endpoint ||
              target.configs?.webdav_url ||
              target.configs?.webdavUrl ||
              "",
            webdav_username:
              target.configs?.webdav_username ||
              target.configs?.webdav_user ||
              target.configs?.webdavUsername ||
              "",
            webdav_password:
              target.configs?.webdav_password ||
              target.configs?.webdav_pass ||
              target.configs?.webdavPassword ||
              "",
            webdav_base_path:
              target.configs?.webdav_base_path ||
              target.configs?.webdav_path ||
              target.configs?.webdavBasePath ||
              "",
            webdav_skip_tls_verify:
              target.configs?.webdav_skip_tls_verify ||
              target.configs?.webdavSkipTLSVerify ||
              false,
            ftp_host:
              target.configs?.ftp_host ||
              target.configs?.ftp_endpoint ||
              "",
            ftp_port: target.configs?.ftp_port || 21,
            ftp_username:
              target.configs?.ftp_username ||
              target.configs?.ftp_user ||
              "",
            ftp_password:
              target.configs?.ftp_password ||
              target.configs?.ftp_pass ||
              "",
            ftp_base_path:
              target.configs?.ftp_base_path ||
              target.configs?.ftp_path ||
              "",
            ftp_tls: Boolean(target.configs?.ftp_tls || false),
            ftp_skip_tls_verify: Boolean(
              target.configs?.ftp_skip_tls_verify || target.configs?.ftpSkipTLSVerify || false
            ),
            ftp_timeout: target.configs?.ftp_timeout || 15,
            s3_endpoint: target.configs?.s3_endpoint || "",
            s3_region: target.configs?.s3_region || "",
            s3_bucket: target.configs?.s3_bucket || "",
            s3_access_key: target.configs?.s3_access_key || "",
            s3_secret_key: target.configs?.s3_secret_key || "",
            s3_session_token: target.configs?.s3_session_token || "",
            s3_force_path_style: Boolean(target.configs?.s3_force_path_style || false),
            proxy: Boolean(target.configs?.proxy || false),
            allowed_extensions: allowedExtensions,
            path_template: pathTemplate,
            enable_compression: target.configs?.enable_compression || false,
            compression_quality: target.configs?.compression_quality || 85,
            target_format: target.configs?.target_format || "",
            process_formats: target.configs?.process_formats || ""
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
          webdav_endpoint: "",
          webdav_username: "",
          webdav_password: "",
          webdav_base_path: "",
          webdav_skip_tls_verify: false,
          ftp_host: "",
          ftp_port: 21,
          ftp_username: "",
          ftp_password: "",
          ftp_base_path: "",
          ftp_tls: false,
          ftp_skip_tls_verify: false,
          ftp_timeout: 15,
          s3_endpoint: "",
          s3_region: "",
          s3_bucket: "",
          s3_access_key: "",
          s3_secret_key: "",
          s3_session_token: "",
          s3_force_path_style: false,
          proxy: false,
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
        webdav_endpoint:
          form.configs?.webdav_endpoint ||
          form.configs?.webdav_url ||
          form.configs?.webdavUrl ||
          "",
        webdav_username:
          form.configs?.webdav_username ||
          form.configs?.webdav_user ||
          form.configs?.webdavUsername ||
          "",
        webdav_password:
          form.configs?.webdav_password ||
          form.configs?.webdav_pass ||
          form.configs?.webdavPassword ||
          "",
        webdav_base_path:
          form.configs?.webdav_base_path ||
          form.configs?.webdav_path ||
          form.configs?.webdavBasePath ||
          "",
        webdav_skip_tls_verify:
          Boolean(form.configs?.webdav_skip_tls_verify || form.configs?.webdavSkipTLSVerify),
        ftp_host: (form.configs as any)?.ftp_host || (form.configs as any)?.ftp_endpoint || "",
        ftp_port: (form.configs as any)?.ftp_port || 21,
        ftp_username: (form.configs as any)?.ftp_username || (form.configs as any)?.ftp_user || "",
        ftp_password: (form.configs as any)?.ftp_password || (form.configs as any)?.ftp_pass || "",
        ftp_base_path: (form.configs as any)?.ftp_base_path || (form.configs as any)?.ftp_path || "",
        ftp_tls: Boolean((form.configs as any)?.ftp_tls || false),
        ftp_skip_tls_verify: Boolean(
          (form.configs as any)?.ftp_skip_tls_verify || (form.configs as any)?.ftpSkipTLSVerify
        ),
        ftp_timeout: (form.configs as any)?.ftp_timeout || 15,
        s3_endpoint: (form.configs as any)?.s3_endpoint || "",
        s3_region: (form.configs as any)?.s3_region || "",
        s3_bucket: (form.configs as any)?.s3_bucket || "",
        s3_access_key: (form.configs as any)?.s3_access_key || "",
        s3_secret_key: (form.configs as any)?.s3_secret_key || "",
        s3_session_token: (form.configs as any)?.s3_session_token || "",
        s3_force_path_style: Boolean((form.configs as any)?.s3_force_path_style || false),
        proxy: Boolean((form.configs as any)?.proxy || false),
        allowed_extensions: form.configs?.allowed_extensions || "",
        path_template: form.configs?.path_template || "{year}/{month}/{day}/{uuid}",
        pattern: form.configs?.path_template || "{year}/{month}/{day}/{uuid}",
        enable_compression: (form.configs as any)?.enable_compression || false,
        compression_quality: (form.configs as any)?.compression_quality || 85,
        target_format: (form.configs as any)?.target_format || "",
        process_formats: (form.configs as any)?.process_formats || ""
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
            {form.configs?.driver === "webdav" ? (
              <div className="space-y-2">
                <Label>WebDAV Endpoint</Label>
                <Input
                  value={(form.configs as any)?.webdav_endpoint || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, webdav_endpoint: e.target.value }
                    }))
                  }
                  placeholder="https://dav.example.com/remote.php/dav/files/user"
                />
                <p className="text-xs text-muted-foreground">
                  仅用于上传/删除，外链仍由“外部访问域名”控制。
                </p>
              </div>
            ) : form.configs?.driver === "ftp" ? (
              <div className="space-y-2">
                <Label>FTP 主机</Label>
                <Input
                  value={(form.configs as any)?.ftp_host || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, ftp_host: e.target.value }
                    }))
                  }
                  placeholder="ftp.example.com:21 或 ftp://user:pass@host:21"
                />
                <p className="text-xs text-muted-foreground">
                  支持 ftp:// 或 ftps:// 形式，基础目录请在下方配置。
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                <Label>{form.configs?.driver === "s3" ? "对象前缀" : "储存根路径"}</Label>
                <Input
                  value={form.configs?.root || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, root: e.target.value }
                    }))
                  }
                  placeholder={form.configs?.driver === "s3" ? "uploads" : ""}
                />
                <p className="text-xs text-muted-foreground">
                  {form.configs?.driver === "s3"
                    ? "可选，用于作为对象 Key 的前缀。"
                    : "确保该路径具有读写权限。"}
                </p>
              </div>
            )}
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
                仅允许填写域名（不含路径），路径由“路径模板”控制。
              </p>
            </div>
          </div>
          {form.configs?.driver === "s3" && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">S3 配置</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>S3 Endpoint（可选）</Label>
                  <Input
                    value={(form.configs as any)?.s3_endpoint || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_endpoint: e.target.value }
                      }))
                    }
                    placeholder="https://s3.amazonaws.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Region</Label>
                  <Input
                    value={(form.configs as any)?.s3_region || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_region: e.target.value }
                      }))
                    }
                    placeholder="us-east-1"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Bucket</Label>
                  <Input
                    value={(form.configs as any)?.s3_bucket || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_bucket: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Access Key</Label>
                  <Input
                    value={(form.configs as any)?.s3_access_key || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_access_key: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Secret Key</Label>
                  <Input
                    type="password"
                    value={(form.configs as any)?.s3_secret_key || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_secret_key: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>Session Token（可选）</Label>
                  <Input
                    value={(form.configs as any)?.s3_session_token || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_session_token: e.target.value }
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="s3-force-path-style"
                    checked={Boolean((form.configs as any)?.s3_force_path_style)}
                    onCheckedChange={(checked) => {
                      const actualValue = checked === "indeterminate" ? false : checked;
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, s3_force_path_style: actualValue }
                      }));
                    }}
                  />
                  <Label htmlFor="s3-force-path-style" className="cursor-pointer">
                    强制 Path-Style 访问
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="s3-proxy"
                    checked={Boolean((form.configs as any)?.proxy)}
                    onCheckedChange={(checked) => {
                      const actualValue = checked === "indeterminate" ? false : checked;
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, proxy: actualValue }
                      }));
                    }}
                  />
                  <Label htmlFor="s3-proxy" className="cursor-pointer">
                    启用服务端代理（无需公开桶）
                  </Label>
                </div>
                <p className="text-xs text-muted-foreground">
                  关闭代理时，需要配置外部访问域名并确保桶或 CDN 可公网访问。
                </p>
              </div>
            </div>
          )}
          {form.configs?.driver === "ftp" && (
            <div className="space-y-4 rounded-lg border p-4">
              <h3 className="text-sm font-medium">FTP 配置</h3>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>FTP 端口</Label>
                  <Input
                    type="number"
                    min="1"
                    value={(form.configs as any)?.ftp_port || 21}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_port: parseInt(e.target.value, 10) || 21 }
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>基础目录（可选）</Label>
                  <Input
                    value={(form.configs as any)?.ftp_base_path || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_base_path: e.target.value }
                      }))
                    }
                    placeholder="skyimage"
                  />
                </div>
                <div className="space-y-2">
                  <Label>用户名（可选）</Label>
                  <Input
                    value={(form.configs as any)?.ftp_username || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_username: e.target.value }
                      }))
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>密码（可选）</Label>
                  <Input
                    type="password"
                    value={(form.configs as any)?.ftp_password || ""}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_password: e.target.value }
                      }))
                    }
                  />
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ftp-tls"
                    checked={Boolean((form.configs as any)?.ftp_tls)}
                    onCheckedChange={(checked) => {
                      const actualValue = checked === "indeterminate" ? false : checked;
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_tls: actualValue }
                      }));
                    }}
                  />
                  <Label htmlFor="ftp-tls" className="cursor-pointer">
                    启用 TLS（FTPS）
                  </Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ftp-skip-tls-verify"
                    checked={Boolean((form.configs as any)?.ftp_skip_tls_verify)}
                    onCheckedChange={(checked) => {
                      const actualValue = checked === "indeterminate" ? false : checked;
                      setForm((prev) => ({
                        ...prev,
                        configs: { ...prev.configs, ftp_skip_tls_verify: actualValue }
                      }));
                    }}
                  />
                  <Label htmlFor="ftp-skip-tls-verify" className="cursor-pointer">
                    跳过 TLS 证书验证（不推荐）
                  </Label>
                </div>
              </div>
              <div className="space-y-2">
                <Label>超时（秒）</Label>
                <Input
                  type="number"
                  min="1"
                  value={(form.configs as any)?.ftp_timeout || 15}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, ftp_timeout: parseInt(e.target.value, 10) || 15 }
                    }))
                  }
                />
              </div>
            </div>
          )}
          {form.configs?.driver === "webdav" && (
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label>WebDAV 用户名（可选）</Label>
                <Input
                  value={(form.configs as any)?.webdav_username || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, webdav_username: e.target.value }
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>WebDAV 密码（可选）</Label>
                <Input
                  type="password"
                  value={(form.configs as any)?.webdav_password || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, webdav_password: e.target.value }
                    }))
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>WebDAV 基础目录（可选）</Label>
                <Input
                  value={(form.configs as any)?.webdav_base_path || ""}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, webdav_base_path: e.target.value }
                    }))
                  }
                  placeholder="skyimage"
                />
                <p className="text-xs text-muted-foreground">
                  最终上传路径 = 基础目录 + 路径模板。
                </p>
              </div>
              <div className="flex items-center gap-2 pt-8">
                <Checkbox
                  id="webdav-skip-tls-verify"
                  checked={Boolean(
                    (form.configs as any)?.webdav_skip_tls_verify ||
                      (form.configs as any)?.webdavSkipTLSVerify
                  )}
                  onCheckedChange={(checked) => {
                    const actualValue = checked === "indeterminate" ? false : checked;
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, webdav_skip_tls_verify: actualValue }
                    }));
                  }}
                />
                <Label htmlFor="webdav-skip-tls-verify" className="cursor-pointer">
                  跳过 TLS 证书验证（不推荐）
                </Label>
              </div>
            </div>
          )}
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
          <div className="space-y-4 rounded-lg border p-4">
            <h3 className="text-sm font-medium">图片处理配置</h3>
            <div className="flex items-center gap-2">
              <Checkbox
                id="enable-compression"
                checked={Boolean((form.configs as any)?.enable_compression)}
                onCheckedChange={(checked) => {
                  const actualValue = checked === "indeterminate" ? false : checked;
                  setForm((prev) => ({
                    ...prev,
                    configs: { ...prev.configs, enable_compression: actualValue }
                  }));
                }}
              />
              <Label htmlFor="enable-compression" className="cursor-pointer">
                启用图片压缩
              </Label>
            </div>
            {(form.configs as any)?.enable_compression && (
              <div className="space-y-2">
                <Label>压缩质量（1-100）</Label>
                <Input
                  type="number"
                  min="1"
                  max="100"
                  value={(form.configs as any)?.compression_quality || 85}
                  onChange={(e) =>
                    setForm((prev) => ({
                      ...prev,
                      configs: { ...prev.configs, compression_quality: parseInt(e.target.value) || 85 }
                    }))
                  }
                  placeholder="85"
                />
                <p className="text-xs text-muted-foreground">推荐值：85，数值越高质量越好但文件越大。</p>
              </div>
            )}
            <div className="space-y-2">
              <Label>目标格式（可选）</Label>
              <Select
                value={(form.configs as any)?.target_format || ""}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    configs: { ...prev.configs, target_format: value === "none" ? "" : value }
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="不转换格式" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">不转换格式</SelectItem>
                  <SelectItem value="webp">WebP</SelectItem>
                  <SelectItem value="jpeg">JPEG</SelectItem>
                  <SelectItem value="png">PNG</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                将上传的图片转换为指定格式，仅对支持的格式生效。
              </p>
            </div>
            <div className="space-y-2">
              <Label>处理格式范围（可选）</Label>
              <Input
                value={(form.configs as any)?.process_formats || ""}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    configs: { ...prev.configs, process_formats: e.target.value }
                  }))
                }
                placeholder="jpg,jpeg,png,webp"
              />
              <p className="text-xs text-muted-foreground">
                指定哪些格式的图片可以被压缩或转换，使用英文逗号分隔。留空表示处理所有支持的图片格式（jpg、jpeg、png、webp、gif、bmp）。
              </p>
            </div>
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
