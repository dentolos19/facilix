import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "#/components/ui/empty";

export default function ErrorOccurred({ error }: { error: unknown }) {
  return (
    <div className={"flex size-full items-center justify-center"}>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Critical Error</EmptyTitle>
          <EmptyDescription>An unexpected error occurred.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <p className={"font-mono"}>{error instanceof Error ? error.message : String(error)}</p>
        </EmptyContent>
      </Empty>
    </div>
  );
}
