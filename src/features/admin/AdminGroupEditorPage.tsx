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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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

type SizeUnit = 'B' | 'KB' | 'MB' | 'GB' | 'TB';

const UNITS: { value: SizeUnit; label: string; bytes: number }[] = [
  { value: 'B', label: 'B', bytes: 1 },
  { value: 'KB', label: 'KB', bytes: 1024 },
  { value: 'MB', label: 'MB', bytes: 1024 * 1024 },
  { value: 'GB', label: 'GB', bytes: 1024 * 1024 * 1024 },
  { value: 'TB', label: 'TB', bytes: 1024 * 1024 * 1024 * 1024 },
];

function bytesToUnit(bytes: number, unit: SizeUnit): number {
  const unitInfo = UNITS.find(u => u.value === unit);
  if (!unitInfo) return bytes;
  return bytes / unitInfo.bytes;
}

function unitToBytes(value: number, unit: SizeUnit): number {
  const unitInfo = UNITS.find(u => u.value === unit);
  if (!unitInfo) return value;
  return value * unitInfo.bytes;
}

function detectUnit(bytes: number): SizeUnit {
  if (bytes === 0) return 'MB';
  for (let i = UNITS.length - 1; i >= 0; i--) {
    if (bytes >= UNITS[i].bytes && bytes % UNITS[i].bytes === 0) {
      return UNITS[i].value;
    }
  }
  return 'MB';
}

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

  const [fileSizeUnit, setFileSizeUnit] = useState<SizeUnit>('MB');
  const [capacityUnit, setCapacityUnit] = useState<SizeUnit>('GB');

  useEffect(() => {
    if (isEditing && groups) {
      const target = groups.find((item) => item.id === Number(id));
      if (target) {
        const fileSize = target.configs?.max_file_size ?? defaultGroupConfigs.max_file_size;
        const capacity = target.configs?.max_capacity ?? defaultGroupConfigs.max_capacity;
        
        const detectedFileSizeUnit = detectUnit(fileSize);
        const detectedCapacityUnit = detectUnit(capacity);
        
        setFileSizeUnit(detectedFileSizeUnit);
        setCapacityUnit(detectedCapacityUnit);
        
        setForm({
          ...target,
          configs: {
            max_file_size: fileSize,
            max_capacity: capacity
          }
        });
      }
    } else if (!isEditing) {
      setForm({ name: "", configs: { ...defaultGroupConfigs } });
      setFileSizeUnit('MB');
      setCapacityUnit('GB');
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
              <Label>最大单文件大小</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex-1"
                  value={
                    form.configs?.max_file_size
                      ? bytesToUnit(form.configs.max_file_size, fileSizeUnit).toString()
                      : ""
                  }
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setForm((prev) => ({
                      ...prev,
                      configs: {
                        ...prev.configs,
                        max_file_size: unitToBytes(value, fileSizeUnit)
                      }
                    }));
                  }}
                />
                <Select value={fileSizeUnit} onValueChange={(v) => setFileSizeUnit(v as SizeUnit)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>容量上限</Label>
              <div className="flex gap-2">
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  className="flex-1"
                  value={
                    form.configs?.max_capacity
                      ? bytesToUnit(form.configs.max_capacity, capacityUnit).toString()
                      : ""
                  }
                  onChange={(e) => {
                    const value = Number(e.target.value || 0);
                    setForm((prev) => ({
                      ...prev,
                      configs: {
                        ...prev.configs,
                        max_capacity: unitToBytes(value, capacityUnit)
                      }
                    }));
                  }}
                />
                <Select value={capacityUnit} onValueChange={(v) => setCapacityUnit(v as SizeUnit)}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {UNITS.map(unit => (
                      <SelectItem key={unit.value} value={unit.value}>
                        {unit.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
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
