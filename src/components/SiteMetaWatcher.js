import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchSiteConfig } from "@/lib/api";
export function SiteMetaWatcher({ active }) {
    const { data } = useQuery({
        queryKey: ["site-meta"],
        queryFn: fetchSiteConfig,
        enabled: active,
        staleTime: 5 * 60 * 1000
    });
    useEffect(() => {
        if (data?.title) {
            document.title = data.title;
        }
    }, [data]);
    return null;
}
