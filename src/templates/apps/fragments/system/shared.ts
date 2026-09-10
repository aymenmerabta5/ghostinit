export type RouterType = "next" | "tanstack";
export const sharedNotFoundInner = {
  title: "Page not found",
  description: "The page you are looking for does not exist or was moved.",
  cardClass: "w-full max-w-[440px] border-0 bg-transparent shadow-none",
  mainClass:
    "flex min-h-[calc(100dvh-4rem)] items-center justify-center bg-background px-5 py-10 sm:px-8",
};

export const sharedErrorInner = {
  title: "Something went wrong",
  description: "An unexpected error occurred. You can try again.",
  cardClass: "w-full max-w-[440px] border-0 bg-transparent shadow-none",
};

export const sharedLoadingSkeletons = `<div className="mx-auto flex max-w-6xl flex-col gap-8 px-5 py-8 sm:px-8 lg:px-10 lg:py-10">
        <div className="space-y-3"><Skeleton className="h-9 w-48" /><Skeleton className="h-5 w-64 max-w-full" /></div>
        <div className="grid gap-6 lg:grid-cols-[1.35fr_1fr]">
          <Skeleton className="h-64 rounded-lg" />
          <Skeleton className="h-64 rounded-lg" />
        </div>
      </div>`;
