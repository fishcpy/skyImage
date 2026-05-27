import { SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useSearch } from "@/context/search-provider";
import { cn } from "@/lib/utils";

type SearchProps = React.ComponentProps<"button"> & {
  placeholder?: string;
};

export function Search({
  className = "",
  placeholder = "Search",
  ...props
}: SearchProps) {
  const { setOpen } = useSearch();

  return (
    <Button
      {...props}
      variant="outline"
      className={cn(
        "group relative h-8 w-full flex-1 justify-start rounded-md bg-muted/25 pl-8 pr-3 text-sm font-normal text-muted-foreground shadow-none hover:bg-accent sm:w-40 sm:pr-12 md:flex-none lg:w-52 xl:w-64",
        className
      )}
      aria-keyshortcuts="Meta+K Control+K"
      onClick={() => setOpen(true)}
    >
      <SearchIcon
        aria-hidden="true"
        className="absolute left-1.5 top-1/2 -translate-y-1/2"
        size={16}
      />
      <span className="truncate">{placeholder}</span>
      <kbd className="pointer-events-none absolute right-1.5 top-1.5 hidden h-5 items-center gap-1 rounded border bg-muted px-1.5 font-mono text-[10px] font-medium select-none group-hover:bg-accent sm:flex">
        <span className="text-xs">⌘</span>K
      </kbd>
    </Button>
  );
}