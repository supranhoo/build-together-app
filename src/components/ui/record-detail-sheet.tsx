/**
 * RecordDetailSheet — generic right-side sheet that opens when a URL
 * `?detail=<id>` param is present on the current tab. Used by Orders and
 * Inquiries; reusable for any module list as drilldown rolls out.
 *
 * The parent supplies the title and the rendered body for the matched
 * record (or `null` if no match — sheet then closes automatically).
 */
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}

export function RecordDetailSheet({ open, onOpenChange, title, description, children }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          {description && <SheetDescription>{description}</SheetDescription>}
        </SheetHeader>
        <div className="mt-4 space-y-4">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
