import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import { addMonths, format, getDaysInMonth, startOfMonth } from "date-fns";
import { zhCN } from "date-fns/locale";
import { Calendar as CalendarIcon, ChevronDown, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";
import { cn } from "@/lib/utils";
import {
  fetchApiTokens,
  generateApiToken,
  updateApiToken,
  ApiTokenRecord
} from "@/lib/api";

type EditorMode = "create" | "edit";

const defaultTime = "23:59";

type TimePeriod = "AM" | "PM";

function parseTimeTo12(time: string) {
  const [hourValue, minuteValue] = time.split(":");
  const hour24 = Number(hourValue);
  const period: TimePeriod = hour24 >= 12 ? "PM" : "AM";
  let hour12 = hour24 % 12;
  if (hour12 === 0) hour12 = 12;
  return {
    period,
    hour: String(hour12),
    minute: minuteValue ?? "00"
  };
}

function to24HourString(period: TimePeriod, hourValue: string, minuteValue: string) {
  const hourNumber = Number(hourValue);
  const baseHour = hourNumber % 12;
  const hour24 = period === "PM" ? baseHour + 12 : baseHour;
  return `${String(hour24).padStart(2, "0")}:${minuteValue}`;
}

function isNeverExpire(expiresAt?: string) {
  if (!expiresAt) return false;
  const time = new Date(expiresAt);
  return time.getUTCFullYear() >= 9999;
}

function formatExpiresAt(date?: Date, time?: string) {
  if (!date) return "";
  const formatted = format(date, "yyyy-MM-dd");
  const safeTime = time && time.trim() !== "" ? time : defaultTime;
  return `${formatted} ${safeTime}`;
}

function getYearOptions(base: Date, range = 5) {
  const currentYear = base.getFullYear();
  return Array.from({ length: range * 2 + 1 }).map((_, index) => {
    const year = currentYear - range + index;
    return { label: `${year}年`, value: year };
  });
}

function getMonthList() {
  return Array.from({ length: 12 }).map((_, index) => ({
    label: `${index + 1}月`,
    value: index
  }));
}

export function ApiTokenEditorPage() {
  const { id } = useParams();
  const mode: EditorMode = id ? "edit" : "create";
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: tokens = [], isLoading } = useQuery({
    queryKey: ["api-tokens"],
    queryFn: fetchApiTokens
  });

  const currentToken = useMemo<ApiTokenRecord | undefined>(
    () => tokens.find((token) => token.id === Number(id)),
    [id, tokens]
  );

  const [neverExpire, setNeverExpire] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(undefined);
  const [displayMonth, setDisplayMonth] = useState<Date>(() => startOfMonth(new Date()));
  const defaultTimeParts = useMemo(() => parseTimeTo12(defaultTime), []);
  const [timePeriod, setTimePeriod] = useState<TimePeriod>(defaultTimeParts.period);
  const [timeHour, setTimeHour] = useState(defaultTimeParts.hour);
  const [timeMinute, setTimeMinute] = useState(defaultTimeParts.minute);
  const [createdToken, setCreatedToken] = useState<string>("");

  useEffect(() => {
    if (mode === "create") {
      setNeverExpire(false);
      setSelectedDate(undefined);
      setTimePeriod(defaultTimeParts.period);
      setTimeHour(defaultTimeParts.hour);
      setTimeMinute(defaultTimeParts.minute);
      setDisplayMonth(startOfMonth(new Date()));
      return;
    }
    if (!currentToken?.expiresAt) {
      return;
    }
    const never = isNeverExpire(currentToken.expiresAt);
    setNeverExpire(never);
    if (never) {
      setSelectedDate(undefined);
      setTimePeriod(defaultTimeParts.period);
      setTimeHour(defaultTimeParts.hour);
      setTimeMinute(defaultTimeParts.minute);
      setDisplayMonth(startOfMonth(new Date()));
      return;
    }
    const date = new Date(currentToken.expiresAt);
    setSelectedDate(date);
    setDisplayMonth(startOfMonth(date));
    const parsed = parseTimeTo12(format(date, "HH:mm"));
    setTimePeriod(parsed.period);
    setTimeHour(parsed.hour);
    setTimeMinute(parsed.minute);
  }, [mode, currentToken, defaultTimeParts]);

  const yearOptions = useMemo(() => getYearOptions(new Date()), []);
  const monthOptions = useMemo(() => getMonthList(), []);
  const hourOptions = useMemo(
    () => Array.from({ length: 12 }, (_, index) => String(index + 1)),
    []
  );
  const minuteOptions = useMemo(
    () => Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0")),
    []
  );

  const timeValue = useMemo(
    () => to24HourString(timePeriod, timeHour, timeMinute),
    [timePeriod, timeHour, timeMinute]
  );

  const daysInMonth = useMemo(
    () => getDaysInMonth(displayMonth),
    [displayMonth]
  );

  const createMutation = useMutation({
    mutationFn: (expiresAt: string | undefined) =>
      generateApiToken(expiresAt ? { expiresAt } : undefined),
    onSuccess: (data) => {
      setCreatedToken(data.token);
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("API Token 已生成");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const updateMutation = useMutation({
    mutationFn: (expiresAt: string) => updateApiToken(Number(id), { expiresAt }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["api-tokens"] });
      toast.success("到期时间已更新");
      navigate("/dashboard/api-tokens");
    },
    onError: (error: Error) => toast.error(error.message)
  });

  const expiryPayload = useMemo(() => {
    if (neverExpire) {
      return "never";
    }
    return formatExpiresAt(selectedDate, timeValue);
  }, [neverExpire, selectedDate, timeValue]);

  const handleSubmit = () => {
    if (!expiryPayload) {
      toast.error("请选择到期日期");
      return;
    }
    if (mode === "create") {
      createMutation.mutate(expiryPayload === "never" ? undefined : expiryPayload);
      return;
    }
    updateMutation.mutate(expiryPayload);
  };

  const handleBack = () => navigate("/dashboard/api-tokens");

  const disableSubmit = mode === "create" ? createMutation.isPending : updateMutation.isPending;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={handleBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          返回
        </Button>
        <div>
          <h1 className="text-2xl font-semibold">
            {mode === "create" ? "新建 API Token" : "编辑 API Token"}
          </h1>
          <p className="text-muted-foreground">
            {mode === "create"
              ? "设置到期时间后生成新的 Token"
              : "更新 Token 的到期时间"}
          </p>
        </div>
      </div>

      {mode === "edit" && !isLoading && !currentToken && (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            未找到该 Token，可能已被删除。
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>到期设置</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center space-x-2">
            <Checkbox
              id="neverExpire"
              checked={neverExpire}
              onCheckedChange={(checked) => setNeverExpire(checked === true)}
            />
            <div className="space-y-1">
              <Label htmlFor="neverExpire" className="text-sm font-medium">
                无限期 Token
              </Label>
              <p className="text-xs text-muted-foreground">开启后不再限制到期时间</p>
            </div>
          </div>

          {!neverExpire && (
            <FieldGroup className="max-w-xs flex-row">
              <Field>
                <FieldLabel className="block">
                  到期日期
                </FieldLabel>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      id="token-date"
                      className="w-32 justify-between font-normal"
                    >
                      {selectedDate
                        ? format(selectedDate, "yyyy年M月d日", { locale: zhCN })
                        : "选择日期"}
                      <ChevronDown />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-4" align="start" side="bottom">
                    <div className="flex items-center gap-2 pb-3">
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDisplayMonth((prev) => addMonths(prev, -1))}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </Button>
                      <Select
                        value={String(displayMonth.getFullYear())}
                        onValueChange={(value) => {
                          const year = Number(value);
                          setDisplayMonth(
                            startOfMonth(new Date(year, displayMonth.getMonth(), 1))
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 w-[110px]">
                          <SelectValue placeholder="选择年份" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {yearOptions.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Select
                        value={String(displayMonth.getMonth())}
                        onValueChange={(value) => {
                          const month = Number(value);
                          setDisplayMonth(
                            startOfMonth(new Date(displayMonth.getFullYear(), month, 1))
                          );
                        }}
                      >
                        <SelectTrigger className="h-8 w-[90px]">
                          <SelectValue placeholder="选择月份" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectGroup>
                            {monthOptions.map((option) => (
                              <SelectItem key={option.value} value={String(option.value)}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => setDisplayMonth((prev) => addMonths(prev, 1))}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="grid grid-cols-7 gap-2">
                      {Array.from({ length: daysInMonth }, (_, index) => {
                        const day = index + 1;
                        const date = new Date(
                          displayMonth.getFullYear(),
                          displayMonth.getMonth(),
                          day
                        );
                        const isSelected =
                          selectedDate &&
                          format(selectedDate, "yyyy-MM-dd") === format(date, "yyyy-MM-dd");
                        return (
                          <button
                            key={day}
                            type="button"
                            onClick={() => setSelectedDate(date)}
                            className={cn(
                              "h-8 w-8 rounded-md text-sm hover:bg-accent",
                              isSelected && "bg-primary text-primary-foreground hover:bg-primary"
                            )}
                          >
                            {day}
                          </button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              </Field>
              <Field className="w-52">
                <FieldLabel htmlFor="token-time">到期时间</FieldLabel>
                <div className="flex items-center gap-2">
                  <Select value={timePeriod} onValueChange={(value) => setTimePeriod(value as TimePeriod)}>
                    <SelectTrigger className="h-9 w-[72px]">
                      <SelectValue placeholder="上午/下午" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        <SelectItem value="AM">上午</SelectItem>
                        <SelectItem value="PM">下午</SelectItem>
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select value={timeHour} onValueChange={setTimeHour}>
                    <SelectTrigger className="h-9 w-[70px]">
                      <SelectValue placeholder="小时" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {hourOptions.map((hour) => (
                          <SelectItem key={hour} value={hour}>
                            {hour}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                  <Select value={timeMinute} onValueChange={setTimeMinute}>
                    <SelectTrigger className="h-9 w-[70px]">
                      <SelectValue placeholder="分钟" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectGroup>
                        {minuteOptions.map((minute) => (
                          <SelectItem key={minute} value={minute}>
                            {minute}
                          </SelectItem>
                        ))}
                      </SelectGroup>
                    </SelectContent>
                  </Select>
                </div>
              </Field>
            </FieldGroup>
          )}

          <div className="flex items-center gap-3">
            <Button onClick={handleSubmit} disabled={disableSubmit || (mode === "edit" && !currentToken)}>
              {disableSubmit ? "提交中..." : mode === "create" ? "生成 Token" : "保存修改"}
            </Button>
            <Button variant="outline" onClick={handleBack}>
              取消
            </Button>
          </div>
        </CardContent>
      </Card>

      {mode === "create" && createdToken && (
        <Card className="border-green-500/50 bg-green-50 dark:bg-green-950/20">
          <CardHeader>
            <CardTitle className="text-green-700 dark:text-green-400">新 Token 已生成</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label className="text-sm font-medium">您的 API Token</Label>
              <div className="mt-2 flex items-center gap-2">
                <Input value={createdToken} readOnly className="font-mono text-sm" />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    navigator.clipboard.writeText(createdToken);
                    toast.success("已复制到剪贴板");
                  }}
                >
                  复制
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                请立即复制保存此 Token，关闭后将无法再次查看完整内容。
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}