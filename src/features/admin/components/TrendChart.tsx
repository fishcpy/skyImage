import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useI18n } from "@/i18n";

type TrendChartProps = {
  data: Array<{
    date: string;
    uploads: number;
    registrations: number;
  }>;
};

export function TrendChart({ data }: TrendChartProps) {
  const { t, locale } = useI18n();
  const [timeRange, setTimeRange] = React.useState("30d");

  const chartConfig = React.useMemo(
    () =>
      ({
        uploads: {
          label: t("chart.uploads"),
          color: "hsl(217, 91%, 60%)",
        },
        registrations: {
          label: t("chart.registrations"),
          color: "hsl(210, 100%, 80%)",
        },
      }) satisfies ChartConfig,
    [t]
  );

  const filteredData = React.useMemo(() => {
    if (!data || data.length === 0) return [];

    const now = new Date();
    let daysToSubtract = 30;

    if (timeRange === "90d") {
      daysToSubtract = 90;
    } else if (timeRange === "7d") {
      daysToSubtract = 7;
    }

    const startDate = new Date(now);
    startDate.setDate(startDate.getDate() - daysToSubtract);

    return data.filter((item) => {
      const date = new Date(item.date);
      return date >= startDate;
    });
  }, [data, timeRange]);

  const getTimeRangeLabel = () => {
    switch (timeRange) {
      case "7d":
        return t("chart.last7Days");
      case "30d":
        return t("chart.last30Days");
      case "90d":
        return t("chart.last90Days");
      default:
        return t("chart.last30Days");
    }
  };

  return (
    <Card className="pt-0 [&_*]:outline-none [&_*]:ring-0 [&_*:focus]:outline-none [&_*:focus]:ring-0">
      <CardHeader className="flex items-center gap-2 space-y-0 border-b py-5 sm:flex-row">
        <div className="grid flex-1 gap-1">
          <CardTitle>{t("chart.adminTrendTitle")}</CardTitle>
          <CardDescription>
            {t("chart.adminTrendDescription", { range: getTimeRangeLabel() })}
          </CardDescription>
        </div>
        <Select value={timeRange} onValueChange={setTimeRange}>
          <SelectTrigger
            className="hidden w-[160px] rounded-lg sm:ml-auto sm:flex"
            aria-label={t("chart.selectRange")}
          >
            <SelectValue placeholder={t("chart.last30Days")} />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            <SelectItem value="90d" className="rounded-lg">
              {t("chart.last90Days")}
            </SelectItem>
            <SelectItem value="30d" className="rounded-lg">
              {t("chart.last30Days")}
            </SelectItem>
            <SelectItem value="7d" className="rounded-lg">
              {t("chart.last7Days")}
            </SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="px-2 pt-4 sm:px-6 sm:pt-6">
        {filteredData.length === 0 ? (
          <div className="flex h-[250px] items-center justify-center text-sm text-muted-foreground">
            {t("chart.noData")}
          </div>
        ) : (
          <ChartContainer
            config={chartConfig}
            className="aspect-auto h-[250px] w-full"
          >
            <AreaChart data={filteredData}>
              <defs>
                <linearGradient id="fillUploads" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor="var(--color-uploads)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-uploads)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
                <linearGradient
                  id="fillRegistrations"
                  x1="0"
                  y1="0"
                  x2="0"
                  y2="1"
                >
                  <stop
                    offset="5%"
                    stopColor="var(--color-registrations)"
                    stopOpacity={0.8}
                  />
                  <stop
                    offset="95%"
                    stopColor="var(--color-registrations)"
                    stopOpacity={0.1}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="date"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={32}
                tickFormatter={(value) => {
                  const date = new Date(value);
                  return date.toLocaleDateString(locale, {
                    month: "short",
                    day: "numeric",
                  });
                }}
              />
              <ChartTooltip
                cursor={false}
                content={
                  <ChartTooltipContent
                    labelFormatter={(value) => {
                      return new Date(value).toLocaleDateString(locale, {
                        month: "long",
                        day: "numeric",
                      });
                    }}
                    indicator="dot"
                  />
                }
              />
              <Area
                dataKey="uploads"
                name={t("chart.uploads")}
                type="natural"
                fill="url(#fillUploads)"
                stroke="var(--color-uploads)"
              />
              <Area
                dataKey="registrations"
                name={t("chart.registrations")}
                type="natural"
                fill="url(#fillRegistrations)"
                stroke="var(--color-registrations)"
              />
              <ChartLegend
                content={({ payload }) => {
                  if (!payload?.length) return null;
                  return (
                    <div className="flex items-center justify-center gap-4 pt-3">
                      {payload.map((item, index) => (
                        <div
                          key={`legend-${index}`}
                          className="flex items-center gap-1.5"
                        >
                          <div
                            className="h-2 w-2 shrink-0 rounded-[2px]"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className="text-sm text-muted-foreground">
                            {item.dataKey === "uploads" ? t("chart.uploads") : t("chart.registrations")}
                          </span>
                        </div>
                      ))}
                    </div>
                  );
                }}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
