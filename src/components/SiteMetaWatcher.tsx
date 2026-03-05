import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

import { fetchSiteConfig } from "@/lib/api";

type Props = {
  active: boolean;
};

export function SiteMetaWatcher({ active }: Props) {
  const getCachedConfig = () => {
    try {
      const cached = localStorage.getItem("skyimage-site-config");
      return cached ? JSON.parse(cached) : undefined;
    } catch {
      return undefined;
    }
  };
  
  const { data } = useQuery({
    queryKey: ["site-meta"],
    queryFn: fetchSiteConfig,
    enabled: active,
    initialData: getCachedConfig,
    staleTime: 5 * 60 * 1000
  });

  useEffect(() => {
    if (data?.title) {
      document.title = data.title;
    }
  }, [data]);

  return null;
}
