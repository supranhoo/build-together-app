import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Pagination, PaginationContent, PaginationItem, PaginationNext, PaginationPrevious } from "@/components/ui/pagination";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/hooks/use-workspace";
import { AUDIT_LOG_PAGE_SIZE, fetchAuditLogPage, type AuditLogRecord } from "@/lib/workspace";

export default function AdminAudit() {
  const { activeProfitCenterId, auditLogs, auditLogsHasMore, auditLogsNextOffset } = useWorkspace();
  const [loadedLogs, setLoadedLogs] = useState<AuditLogRecord[]>(auditLogs);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(auditLogsHasMore);
  const [nextOffset, setNextOffset] = useState<number | null>(auditLogsNextOffset);
  const [isLoadingMore, setIsLoadingMore] = useState(false);

  useEffect(() => {
    setLoadedLogs(auditLogs);
    setCurrentPage(1);
    setHasMore(auditLogsHasMore);
    setNextOffset(auditLogsNextOffset);
  }, [activeProfitCenterId, auditLogs, auditLogsHasMore, auditLogsNextOffset]);

  const totalPages = Math.max(1, Math.ceil(loadedLogs.length / AUDIT_LOG_PAGE_SIZE));
  const pageStart = (currentPage - 1) * AUDIT_LOG_PAGE_SIZE;
  const visibleLogs = useMemo(
    () => loadedLogs.slice(pageStart, pageStart + AUDIT_LOG_PAGE_SIZE),
    [loadedLogs, pageStart],
  );

  const handleLoadMore = async () => {
    if (isLoadingMore || nextOffset === null) return;

    setIsLoadingMore(true);
    try {
      const nextPage = await fetchAuditLogPage({
        profitCenterId: activeProfitCenterId,
        limit: AUDIT_LOG_PAGE_SIZE,
        offset: nextOffset,
      });

      setLoadedLogs((currentLogs) => [...currentLogs, ...nextPage.logs.filter((log) => !currentLogs.some((entry) => entry.id === log.id))]);
      setHasMore(nextPage.hasMore);
      setNextOffset(nextPage.nextOffset);
    } finally {
      setIsLoadingMore(false);
    }
  };

  return (
    <Card className="border-border bg-card shadow-panel">
      <CardHeader>
        <CardTitle>Audit review</CardTitle>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
              <TableHead>Actor</TableHead>
              <TableHead>Summary</TableHead>
              <TableHead>Created</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {visibleLogs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="font-medium text-foreground">{log.action}</TableCell>
                <TableCell>{log.entityType}</TableCell>
                <TableCell>{log.actorUserId}</TableCell>
                <TableCell className="max-w-[320px] truncate">{JSON.stringify(log.changeSummary)}</TableCell>
                <TableCell>{new Date(log.createdAt).toLocaleString()}</TableCell>
              </TableRow>
            ))}
            {loadedLogs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-muted-foreground">No audit records are visible for the current scope yet.</TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
         {loadedLogs.length > 0 && (
           <div className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
             <Pagination className="mx-0 justify-start">
               <PaginationContent>
                 <PaginationItem>
                   <PaginationPrevious
                     href="#"
                     aria-disabled={currentPage === 1}
                     className={currentPage === 1 ? "pointer-events-none opacity-50" : undefined}
                     onClick={(event) => {
                       event.preventDefault();
                       setCurrentPage((page) => Math.max(1, page - 1));
                     }}
                   />
                 </PaginationItem>
                 <PaginationItem>
                   <span className="px-3 text-sm text-muted-foreground">
                     Page {currentPage} of {totalPages}
                   </span>
                 </PaginationItem>
                 <PaginationItem>
                   <PaginationNext
                     href="#"
                     aria-disabled={currentPage >= totalPages}
                     className={currentPage >= totalPages ? "pointer-events-none opacity-50" : undefined}
                     onClick={(event) => {
                       event.preventDefault();
                       setCurrentPage((page) => Math.min(totalPages, page + 1));
                     }}
                   />
                 </PaginationItem>
               </PaginationContent>
             </Pagination>
             <Button onClick={() => void handleLoadMore()} disabled={!hasMore || isLoadingMore} variant="outline">
               {isLoadingMore ? "Loading..." : hasMore ? "Load more" : "No more records"}
             </Button>
           </div>
         )}
      </CardContent>
    </Card>
  );
}
