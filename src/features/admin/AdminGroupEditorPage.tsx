import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  assignUserGroup,
  fetchGroups,
  fetchUsers,
  saveGroup,
  type GroupRecord
} from "@/lib/api";
import { useAuthStore } from "@/state/auth";

const defaultGroupConfigs = {
  max_file_size: 10 * 1024 * 1024,
  max_capacity: 1024 * 1024 * 1024
};

export function AdminGroupEditorPage() {
  const { id } = useParams();
  const isEditing = Boolean(id);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: groups } = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: fetchGroups
  });

  const { data: users } = useQuery({
    queryKey: ["admin", "users"],
    queryFn: fetchUsers,
    enabled: isEditing
  });

  const [form, setForm] = useState<Partial<GroupRecord>>({
    name: "",
    configs: { ...defaultGroupConfigs }
  });

  useEffect(() => {
    if (isEditing && groups) {
      const target = groups.find((item) => item.id === Number(id));
      if (target) {
        setForm({
          ...target,
          configs: {
            max_file_size: target.configs?.max_file_size ?? defaultGroupConfigs.max_file_size,
            max_capacity: target.configs?.max_capacity ?? defaultGroupConfigs.max_capacity
          }
        });
      }
    } else if (!isEditing) {
      setForm({ name: "", configs: { ...defaultGroupConfigs } });
    }
  }, [groups, id, isEditing]);

  const saveMutation = useMutation({
    mutationFn: saveGroup,
    onSuccess: () => {
      toast.success("角色组已保存");
      queryClient.invalidateQueries({ queryKey: ["admin", "groups"] });
      
      // Refresh current user's capacity
      useAuthStore.getState().refreshUser().then(() => {
        console.log('[AdminGroupEditor] User refreshed after save');
      });
      
      navigate("/dashboard/admin/groups");
    },
    onError: (error) => toast.error(error.message)
  });

  const assignMutation = useMutation({
    mutationFn: ({ userId, groupId }: { userId: number; groupId: number | null }) =>
      assignUserGroup(userId, groupId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin", "users"] });
      toast.success("成员已更新");
      
      // Refresh current user
      useAuthStore.getState().refreshUser().then(() => {
        console.log('[AdminGroupEditor] User refreshed after assign');
      });
    },
    onError: (error) => toast.error(error.message)
  });

  const handleSubmit = () => {
    if (!form.name) return;
    const payload = {
      id: form.id,
      name: form.name,
      isDefault: form.isDefault || false,
      configs: {
        max_file_size: form.configs?.max_file_size ?? defaultGroupConfigs.max_file_size,
        max_capacity: form.configs?.max_capacity ?? defaultGroupConfigs.max_capacity
      }
    };
    saveMutation.mutate(payload as GroupRecord);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          <Link className="text-primary" to="/dashboard/admin/groups">
            角色组列表
          </Link>{" "}
          / {isEditing ? "编辑角色组" : "新增角色组"}
        </p>
        <h1 className="text-2xl font-semibold">{isEditing ? form.name : "新建角色组"}</h1>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>基础信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>名称</Label>
              <Input
                value={form.name || ""}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
              />
            </div>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>最大单文件 (MB)</Label>
              <Input
                type="number"
                value={
                  form.configs?.max_file_size
                    ? (form.configs.max_file_size / 1024 / 1024).toString()
                    : ""
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    configs: {
                      ...prev.configs,
                      max_file_size: Number(e.target.value || 0) * 1024 * 1024
                    }
                  }))
                }
              />
            </div>
            <div className="space-y-2">
              <Label>容量上限 (GB)</Label>
              <Input
                type="number"
                value={
                  form.configs?.max_capacity
                    ? (form.configs.max_capacity / 1024 / 1024 / 1024).toString()
                    : ""
                }
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    configs: {
                      ...prev.configs,
                      max_capacity: Number(e.target.value || 0) * 1024 * 1024 * 1024
                    }
                  }))
                }
              />
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="isDefault"
              checked={Boolean(form.isDefault)}
              onCheckedChange={(checked) => {
                const actualValue = checked === 'indeterminate' ? false : checked;
                setForm((prev) => ({ ...prev, isDefault: actualValue }));
              }}
            />
            <Label
              htmlFor="isDefault"
              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
            >
              默认组
            </Label>
          </div>
          <div className="flex gap-3">
            <Button onClick={handleSubmit} disabled={!form.name || saveMutation.isPending}>
              {saveMutation.isPending ? "保存中..." : "保存"}
            </Button>
            <Button
              variant="ghost"
              onClick={() => navigate("/dashboard/admin/groups")}
              disabled={saveMutation.isPending}
            >
              取消
            </Button>
          </div>
        </CardContent>
      </Card>

      {isEditing && (
        <Card>
          <CardHeader>
            <CardTitle>成员管理</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!users?.length && (
              <p className="text-sm text-muted-foreground">暂无用户</p>
            )}
            {users?.map((user) => {
              const inGroup = user.groupId === Number(id);
              return (
                <div
                  key={user.id}
                  className="flex items-center justify-between rounded-md border p-3"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {user.name} · {user.email}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {user.isSuperAdmin ? "超级管理员" : user.isAdmin ? "管理员" : "普通用户"}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant={inGroup ? "secondary" : "outline"}
                    disabled={assignMutation.isPending}
                    onClick={() =>
                      assignMutation.mutate({
                        userId: user.id,
                        groupId: inGroup ? null : Number(id)
                      })
                    }
                  >
                    {inGroup ? "移出本组" : "加入本组"}
                  </Button>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
