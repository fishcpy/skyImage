import { FormEvent, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";

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
import { createUser } from "@/lib/api";
import { useI18n } from "@/i18n";

export function AdminUserCreatePage() {
  const { t } = useI18n();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    role: "user" as "user" | "admin"
  });

  const createMutation = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      toast.success(t("users.created"));
      queryClient.invalidateQueries({ queryKey: ["users"] });
      navigate("/dashboard/admin/users");
    },
    onError: (error) => toast.error(error.message)
  });

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <div className="space-y-6">
      <p className="text-sm text-muted-foreground">
        <Link to="/dashboard/admin/users" className="text-primary">
          {t("users.title")}
        </Link>{" "}
        / {t("users.new")}
      </p>
      <Card>
        <CardHeader>
          <CardTitle>{t("users.new")}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="grid gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label>{t("users.fields.name")}</Label>
              <Input
                value={form.name}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, name: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("users.fields.email")}</Label>
              <Input
                type="email"
                value={form.email}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, email: e.target.value }))
                }
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("users.fields.password")}</Label>
              <Input
                type="password"
                value={form.password}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, password: e.target.value }))
                }
                minLength={8}
                required
              />
            </div>
            <div className="space-y-2">
              <Label>{t("users.fields.role")}</Label>
              <Select
                value={form.role}
                onValueChange={(value) =>
                  setForm((prev) => ({
                    ...prev,
                    role: value as "admin" | "user"
                  }))
                }
              >
                <SelectTrigger className="h-10">
                  <SelectValue placeholder={t("users.fields.roleSelect")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">{t("users.roles.user")}</SelectItem>
                  <SelectItem value="admin">{t("users.roles.admin")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2 flex gap-3">
              <Button type="submit" disabled={createMutation.isPending}>
                {createMutation.isPending ? t("users.actions.creating") : t("users.actions.create")}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => navigate("/dashboard/admin/users")}
                disabled={createMutation.isPending}
              >
                {t("common.cancel")}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
