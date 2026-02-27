type Props = {
  message?: string;
};

export function SplashScreen({ message }: Props) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 text-muted-foreground">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      {message && <p className="text-sm text-muted-foreground">{message}</p>}
    </div>
  );
}
