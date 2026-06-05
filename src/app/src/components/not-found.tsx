import { Link } from "@tanstack/react-router";
import { Button } from "#/src/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyTitle } from "#/src/components/ui/empty";

export default function NotFound() {
  return (
    <div className={"flex size-full items-center justify-center"}>
      <Empty>
        <EmptyHeader>
          <EmptyTitle>Not Found</EmptyTitle>
          <EmptyDescription>The resource you are looking for does not exist.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link to={"/"}>Home</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
